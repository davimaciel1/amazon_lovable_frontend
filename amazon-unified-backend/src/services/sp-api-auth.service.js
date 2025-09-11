/**
 * SP-API Authentication Service
 * Handles LWA token exchange and SigV4 signing for SP-API requests
 * Uses database-stored credentials instead of environment variables
 */

const axios = require('axios');
const crypto = require('crypto');
const DatabaseCredentialsService = require('./database-credentials.service');

class SPAPIAuthService {
  constructor() {
    // Initialize database credentials service
    this.dbCredentials = new DatabaseCredentialsService();
    
    // Initialize credentials (will be loaded from database)
    this.clientId = null;
    this.clientSecret = null;
    this.refreshToken = null;
    this.sellerId = null;
    this.region = null;
    this.marketplaceIds = null;
    
    // AWS credentials for SigV4 (if needed)
    this.awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
    this.awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    this.awsRoleArn = process.env.AWS_ROLE_ARN;
    
    // Token cache
    this.accessToken = null;
    this.tokenExpiry = null;
    
    // Flag to track if credentials are loaded
    this.credentialsLoaded = false;
  }
  
  /**
   * Load credentials from database
   */
  async loadCredentials() {
    if (this.credentialsLoaded) return;
    
    try {
      console.log('📦 Loading SP-API credentials from database...');
      const credentials = await this.dbCredentials.getSPAPICredentials();
      
      this.clientId = credentials.clientId;
      this.clientSecret = credentials.clientSecret;
      this.refreshToken = credentials.refreshToken;
      this.sellerId = credentials.sellerId;
      this.region = credentials.region || 'NA';
      this.marketplaceIds = credentials.marketplaceId || 'ATVPDKIKX0DER,A2Q3Y263D00KWC';
      
      this.credentialsLoaded = true;
      this.validateCredentials();
      
    } catch (error) {
      console.error('❌ Failed to load credentials from database:', error.message);
      
      // Fallback to environment variables
      console.log('⚠️ Falling back to environment variables...');
      this.clientId = process.env.LWA_CLIENT_ID || process.env.SP_API_CLIENT_ID;
      this.clientSecret = process.env.LWA_CLIENT_SECRET || process.env.SP_API_CLIENT_SECRET;
      this.refreshToken = process.env.LWA_REFRESH_TOKEN || process.env.SP_API_REFRESH_TOKEN;
      this.region = process.env.SPAPI_REGION || 'NA';
      this.marketplaceIds = process.env.MARKETPLACE_IDS || 'ATVPDKIKX0DER,A2Q3Y263D00KWC';
      
      this.credentialsLoaded = true;
      this.validateCredentials();
    }
  }
  
  /**
   * Validate that required credentials are present
   */
  validateCredentials() {
    const missing = [];
    
    if (!this.clientId) missing.push('LWA_CLIENT_ID');
    if (!this.clientSecret || this.clientSecret.includes('<')) missing.push('LWA_CLIENT_SECRET');
    if (!this.refreshToken) missing.push('LWA_REFRESH_TOKEN');
    
    if (missing.length > 0) {
      console.warn('⚠️ Missing SP-API credentials:', missing.join(', '));
      console.warn('Please configure these in your .env file');
    } else {
      console.log('✅ SP-API credentials validated');
      console.log(`  Region: ${this.region}`);
      console.log(`  Marketplaces: ${this.marketplaceIds}`);
    }
    
    // AWS credentials are optional (SP-API v2 doesn't require SigV4)
    if (!this.awsAccessKeyId && !this.awsRoleArn) {
      console.log('ℹ️ AWS credentials not configured (using LWA-only authentication)');
    }
  }
  
  /**
   * Get the SP-API endpoint for the configured region
   */
  getEndpoint() {
    const endpoints = {
      'NA': 'https://sellingpartnerapi-na.amazon.com',
      'EU': 'https://sellingpartnerapi-eu.amazon.com',
      'FE': 'https://sellingpartnerapi-fe.amazon.com'
    };
    
    return endpoints[this.region] || endpoints['NA'];
  }
  
  /**
   * Exchange refresh token for access token
   */
  async getAccessToken() {
    // Ensure credentials are loaded
    await this.loadCredentials();
    
    // Check cached token
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }
    
    if (!this.clientSecret || this.clientSecret.includes('<')) {
      throw new Error('LWA_CLIENT_SECRET not configured properly');
    }
    
    try {
      console.log('🔑 Exchanging refresh token for access token...');
      
      const response = await axios.post('https://api.amazon.com/auth/o2/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 10000
        }
      );
      
      this.accessToken = response.data.access_token;
      // Cache for 55 minutes (expires in 60)
      this.tokenExpiry = Date.now() + (55 * 60 * 1000);
      
      console.log('✅ Access token obtained');
      return this.accessToken;
      
    } catch (error) {
      const errorData = error.response?.data;
      console.error('❌ LWA token exchange failed:', errorData || error.message);
      
      if (errorData?.error === 'invalid_client') {
        throw new Error('Invalid client credentials - check LWA_CLIENT_ID and LWA_CLIENT_SECRET');
      } else if (errorData?.error === 'invalid_grant') {
        throw new Error('Invalid or expired refresh token - need to re-authorize the app');
      }
      
      throw error;
    }
  }
  
  /**
   * Make an authenticated request to SP-API
   */
  async request(options) {
    const accessToken = await this.getAccessToken();
    const endpoint = this.getEndpoint();
    
    // Build full URL
    const url = endpoint + options.path;
    
    // Default headers
    const headers = {
      'x-amz-access-token': accessToken,
      'Accept': 'application/json',
      ...options.headers
    };
    
    // Add content type for POST/PUT
    if (options.method === 'POST' || options.method === 'PUT') {
      headers['Content-Type'] = 'application/json';
    }
    
    try {
      const response = await axios({
        method: options.method || 'GET',
        url,
        params: options.params,
        data: options.data,
        headers,
        timeout: options.timeout || 30000
      });
      
      return response.data;
      
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        
        if (status === 403) {
          console.error('❌ Access denied - app may not have required permissions');
          console.error('Required roles/scopes:', options.requiredScopes || 'Unknown');
        } else if (status === 429) {
          console.warn('⚠️ Rate limited - implement backoff');
          const retryAfter = error.response.headers['x-amzn-ratelimit-reset'];
          if (retryAfter) {
            console.warn(`Retry after: ${new Date(retryAfter * 1000).toISOString()}`);
          }
        } else if (status === 404) {
          // This is normal for missing products
          return null;
        }
        
        throw new Error(`SP-API error ${status}: ${JSON.stringify(data)}`);
      }
      
      throw error;
    }
  }
  
  /**
   * Test connection to SP-API
   */
  async testConnection() {
    // Ensure credentials are loaded
    await this.loadCredentials();
    
    try {
      console.log('🔍 Testing SP-API connection...');
      
      // Try to get marketplace participations
      const result = await this.request({
        path: '/sellers/v1/marketplaceParticipations',
        requiredScopes: ['Selling Partner API']
      });
      
      if (result && result.payload) {
        console.log('✅ SP-API connection successful!');
        console.log('  Marketplaces:', result.payload.map(p => p.marketplace.id).join(', '));
        return true;
      }
      
      return false;
      
    } catch (error) {
      console.error('❌ SP-API connection test failed:', error.message);
      return false;
    }
  }
}

module.exports = SPAPIAuthService;