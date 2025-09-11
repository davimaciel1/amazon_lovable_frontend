/**
 * Token Refresh Service
 * Automatically refreshes Amazon SP-API and Ads API tokens
 */

import axios from 'axios';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

class TokenRefreshService {
  private refreshInterval: NodeJS.Timeout | null = null;
  private spApiToken: string | null = null;
  private adsApiToken: string | null = null;
  private spApiTokenExpiry: Date | null = null;
  private adsApiTokenExpiry: Date | null = null;

  constructor() {
    this.startAutoRefresh();
  }

  /**
   * Start automatic token refresh
   */
  private startAutoRefresh() {
    // Refresh tokens immediately on start
    this.refreshAllTokens();

    // Set up interval to refresh tokens every 55 minutes (tokens typically expire in 1 hour)
    this.refreshInterval = setInterval(() => {
      this.refreshAllTokens();
    }, 55 * 60 * 1000); // 55 minutes

    logger.info('Token auto-refresh service started');
  }

  /**
   * Refresh all tokens
   */
  private async refreshAllTokens() {
    try {
      await Promise.all([
        this.refreshSPAPIToken(),
        this.refreshAdsAPIToken()
      ]);
    } catch (error) {
      logger.error('Error refreshing tokens:', error);
    }
  }

  /**
   * Refresh SP-API token
   */
  private async refreshSPAPIToken() {
    try {
      // Get credentials from database
      const credentialsResult = await pool.query(
        `SELECT data FROM "Credentials" WHERE type = 'SP-API' LIMIT 1`
      );

      if (!credentialsResult.rows.length) {
        logger.warn('No SP-API credentials found in database');
        return;
      }

      const credentials = credentialsResult.rows[0].data;
      
      if (!credentials.refresh_token) {
        logger.warn('No SP-API refresh token available');
        return;
      }

      // Request new access token
      const response = await axios.post('https://api.amazon.com/auth/o2/token', {
        grant_type: 'refresh_token',
        refresh_token: credentials.refresh_token,
        client_id: credentials.lwa_app_id || process.env.SP_API_APP_ID,
        client_secret: credentials.lwa_client_secret || process.env.SP_API_CLIENT_SECRET
      });

      const tokenData: TokenResponse = response.data;
      
      // Store new tokens
      this.spApiToken = tokenData.access_token;
      this.spApiTokenExpiry = new Date(Date.now() + (tokenData.expires_in * 1000));

      // Update refresh token in database if it changed
      if (tokenData.refresh_token && tokenData.refresh_token !== credentials.refresh_token) {
        await pool.query(
          `UPDATE "Credentials" 
           SET data = jsonb_set(data, '{refresh_token}', $1::jsonb),
               "updatedAt" = NOW()
           WHERE type = 'SP-API'`,
          [JSON.stringify(tokenData.refresh_token)]
        );
        logger.info('SP-API refresh token updated in database');
      }

      // Store access token in memory/cache for quick access
      await pool.query(
        `INSERT INTO "Credentials" (id, type, data, "createdAt", "updatedAt")
         VALUES ('sp-api-access-token', 'SP-API-ACCESS', $1, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE 
         SET data = $1, "updatedAt" = NOW()`,
        [JSON.stringify({
          access_token: tokenData.access_token,
          expires_at: this.spApiTokenExpiry.toISOString()
        })]
      );

      logger.info('SP-API token refreshed successfully, expires at:', this.spApiTokenExpiry);
    } catch (error) {
      logger.error('Failed to refresh SP-API token:', error);
      
      // If refresh fails due to invalid refresh token, alert the user
      if (axios.isAxiosError(error) && error.response?.status === 400) {
        logger.error('SP-API refresh token is invalid. Manual re-authentication required.');
        // Could send notification or alert here
      }
    }
  }

  /**
   * Refresh Ads API token
   */
  private async refreshAdsAPIToken() {
    try {
      // Get credentials from database
      const credentialsResult = await pool.query(
        `SELECT data FROM "Credentials" WHERE type = 'ADS-API' LIMIT 1`
      );

      if (!credentialsResult.rows.length) {
        logger.warn('No Ads API credentials found in database');
        return;
      }

      const credentials = credentialsResult.rows[0].data;
      
      if (!credentials.refresh_token) {
        logger.warn('No Ads API refresh token available');
        return;
      }

      // Request new access token
      const response = await axios.post('https://api.amazon.com/auth/o2/token', {
        grant_type: 'refresh_token',
        refresh_token: credentials.refresh_token,
        client_id: credentials.client_id || process.env.ADS_API_CLIENT_ID,
        client_secret: credentials.client_secret || process.env.ADS_API_CLIENT_SECRET
      });

      const tokenData: TokenResponse = response.data;
      
      // Store new tokens
      this.adsApiToken = tokenData.access_token;
      this.adsApiTokenExpiry = new Date(Date.now() + (tokenData.expires_in * 1000));

      // Update refresh token in database if it changed
      if (tokenData.refresh_token && tokenData.refresh_token !== credentials.refresh_token) {
        await pool.query(
          `UPDATE "Credentials" 
           SET data = jsonb_set(data, '{refresh_token}', $1::jsonb),
               "updatedAt" = NOW()
           WHERE type = 'ADS-API'`,
          [JSON.stringify(tokenData.refresh_token)]
        );
        logger.info('Ads API refresh token updated in database');
      }

      // Store access token for quick access
      await pool.query(
        `INSERT INTO "Credentials" (id, type, data, "createdAt", "updatedAt")
         VALUES ('ads-api-access-token', 'ADS-API-ACCESS', $1, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE 
         SET data = $1, "updatedAt" = NOW()`,
        [JSON.stringify({
          access_token: tokenData.access_token,
          expires_at: this.adsApiTokenExpiry.toISOString()
        })]
      );

      logger.info('Ads API token refreshed successfully, expires at:', this.adsApiTokenExpiry);
    } catch (error) {
      logger.error('Failed to refresh Ads API token:', error);
      
      if (axios.isAxiosError(error) && error.response?.status === 400) {
        logger.error('Ads API refresh token is invalid. Manual re-authentication required.');
      }
    }
  }

  /**
   * Get current SP-API access token
   */
  public async getSPAPIToken(): Promise<string | null> {
    // Check if token is still valid
    if (this.spApiToken && this.spApiTokenExpiry && this.spApiTokenExpiry > new Date()) {
      return this.spApiToken;
    }

    // Try to get from database
    try {
      const result = await pool.query(
        `SELECT data FROM "Credentials" WHERE id = 'sp-api-access-token'`
      );
      
      if (result.rows.length) {
        const tokenData = result.rows[0].data;
        const expiresAt = new Date(tokenData.expires_at);
        
        if (expiresAt > new Date()) {
          this.spApiToken = tokenData.access_token;
          this.spApiTokenExpiry = expiresAt;
          return this.spApiToken;
        }
      }
    } catch (error) {
      logger.error('Error getting SP-API token from database:', error);
    }

    // Token expired or not found, refresh it
    await this.refreshSPAPIToken();
    return this.spApiToken;
  }

  /**
   * Get current Ads API access token
   */
  public async getAdsAPIToken(): Promise<string | null> {
    // Check if token is still valid
    if (this.adsApiToken && this.adsApiTokenExpiry && this.adsApiTokenExpiry > new Date()) {
      return this.adsApiToken;
    }

    // Try to get from database
    try {
      const result = await pool.query(
        `SELECT data FROM "Credentials" WHERE id = 'ads-api-access-token'`
      );
      
      if (result.rows.length) {
        const tokenData = result.rows[0].data;
        const expiresAt = new Date(tokenData.expires_at);
        
        if (expiresAt > new Date()) {
          this.adsApiToken = tokenData.access_token;
          this.adsApiTokenExpiry = expiresAt;
          return this.adsApiToken;
        }
      }
    } catch (error) {
      logger.error('Error getting Ads API token from database:', error);
    }

    // Token expired or not found, refresh it
    await this.refreshAdsAPIToken();
    return this.adsApiToken;
  }

  /**
   * Stop auto-refresh
   */
  public stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      logger.info('Token auto-refresh service stopped');
    }
  }
}

// Export singleton instance
export const tokenRefreshService = new TokenRefreshService();