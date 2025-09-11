/**
 * Simplified Amazon Advertising API Service
 * Fetches advertising data and campaign metrics
 */

import axios, { AxiosInstance } from 'axios';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

export class SimpleAmazonAdsService {
  private adsApi: AxiosInstance;
  private accessToken: string = '';
  private refreshToken: string;
  private syncInterval: NodeJS.Timeout | null = null;
  private tokenRefreshInterval: NodeJS.Timeout | null = null;
  private useV3: boolean = process.env.ADS_API_USE_V3 === 'true';

  constructor() {
    this.refreshToken = process.env.ADS_API_REFRESH_TOKEN || '';
    
    this.adsApi = axios.create({
      baseURL: 'https://advertising-api.amazon.com',
      headers: {
        'Amazon-Advertising-API-ClientId': process.env.ADS_API_CLIENT_ID,
        'Content-Type': 'application/json'
      }
    });

    // Add request interceptor to include auth token
    this.adsApi.interceptors.request.use((config) => {
      if (this.accessToken) {
        config.headers['Authorization'] = `Bearer ${this.accessToken}`;
      }
      
      // Add profile ID for the request
      const profileId = process.env.ADS_PROFILE_ID_US;
      if (profileId) {
        config.headers['Amazon-Advertising-API-Scope'] = profileId;
      }
      
      return config;
    });
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Simple Amazon Ads Service...');
      
      // Get initial access token
      await this.refreshAccessToken();

      // Start data synchronization
      await this.syncAll();

      // Schedule token refresh every 55 minutes
      this.tokenRefreshInterval = setInterval(() => {
        this.refreshAccessToken().catch(error => {
          logger.error('Ads API token refresh failed:', error);
        });
      }, 55 * 60 * 1000);

      // Schedule data sync every 30 minutes
      this.syncInterval = setInterval(() => {
        this.syncAll().catch(error => {
          logger.error('Scheduled ads sync failed:', error);
        });
      }, 30 * 60 * 1000);

      logger.info('Simple Amazon Ads service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Amazon Ads service:', error);
      // Don't throw - let the service continue without ads sync
    }
  }

  private async refreshAccessToken(): Promise<void> {
    try {
      const response = await axios.post(
        'https://api.amazon.com/auth/o2/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
          client_id: process.env.ADS_API_CLIENT_ID!,
          client_secret: process.env.ADS_API_CLIENT_SECRET!
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.accessToken = response.data.access_token;
      
      if (response.data.refresh_token) {
        this.refreshToken = response.data.refresh_token;
        // Save new refresh token to database
        await this.saveRefreshToken(response.data.refresh_token);
      }

      logger.info('Ads API access token refreshed successfully');
    } catch (error) {
      logger.error('Failed to refresh Ads API access token:', error);
    }
  }

  private async saveRefreshToken(token: string): Promise<void> {
    try {
      // Create table if it doesn't exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS api_tokens (
          id SERIAL PRIMARY KEY,
          service VARCHAR(50) NOT NULL,
          token_type VARCHAR(50) NOT NULL,
          token_value TEXT NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(service, token_type)
        )
      `);
      
      // Save to database for persistence
      await pool.query(`
        INSERT INTO api_tokens (service, token_type, token_value, updated_at)
        VALUES ('amazon_ads', 'refresh_token', $1, NOW())
        ON CONFLICT (service, token_type)
        DO UPDATE SET token_value = $1, updated_at = NOW()
      `, [token]);
    } catch (error) {
      logger.error('Failed to save refresh token:', error);
    }
  }

  async syncAll(): Promise<void> {
    logger.info('Starting Amazon Ads data sync...');
    
    try {
      await this.syncCampaigns();
      await this.syncCampaignMetrics();
      
      logger.info('Amazon Ads data sync completed');
    } catch (error) {
      logger.error('Ads sync failed:', error);
    }
  }

  async syncCampaigns(): Promise<void> {
    try {
      logger.info('Syncing advertising campaigns...');

      // Create campaigns table if it doesn't exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS advertising_campaigns (
          id SERIAL PRIMARY KEY,
          campaign_id BIGINT UNIQUE NOT NULL,
          name VARCHAR(255),
          campaign_type VARCHAR(50),
          targeting_type VARCHAR(50),
          state VARCHAR(50),
          daily_budget DECIMAL(10,2),
          start_date DATE,
          end_date DATE,
          bidding_strategy VARCHAR(100),
          portfolio_id BIGINT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      const response = await this.adsApi.get('/v2/sp/campaigns', {
        params: {
          stateFilter: 'enabled,paused',
          count: 100
        }
      });

      if (response.data && response.data.length > 0) {
        for (const campaign of response.data) {
          await this.saveCampaign(campaign);
        }
        
        logger.info(`Synced ${response.data.length} campaigns`);
      }
    } catch (error: any) {
      logger.error('Campaign sync failed:', error.response?.data || error.message);
    }
  }

  async syncCampaignMetrics(): Promise<void> {
    try {
      logger.info('Syncing campaign metrics...');

      // Create metrics table if it doesn't exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS advertising_metrics (
          id SERIAL PRIMARY KEY,
          campaign_id BIGINT NOT NULL,
          date DATE NOT NULL,
          impressions INTEGER DEFAULT 0,
          clicks INTEGER DEFAULT 0,
          cost DECIMAL(10,2) DEFAULT 0,
          conversions INTEGER DEFAULT 0,
          sales DECIMAL(10,2) DEFAULT 0,
          acos DECIMAL(10,2) DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(campaign_id, date)
        )
      `);

      // Get metrics for yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      if (this.useV3) {
        await this.requestV3ReportAndIngest(yesterday);
      } else {
        // Fallback to v2
        const dateStr = yesterday.toISOString().split('T')[0];
        const reportRequest = {
          reportDate: dateStr,
          metrics: 'impressions,clicks,cost,attributedConversions14d,attributedSales14d'
        };
        const reportResponse = await this.adsApi.post('/v2/sp/campaigns/report', reportRequest);
        if (reportResponse.data && reportResponse.data.reportId) {
          logger.info(`Report requested with ID: ${reportResponse.data.reportId}`);
          setTimeout(() => {
            this.downloadReport(reportResponse.data.reportId);
          }, 10000);
        }
      }
    } catch (error: any) {
      logger.error('Campaign metrics sync failed:', error.response?.data || error.message);
    }
  }

  private async downloadReport(reportId: string): Promise<void> {
    try {
      const statusResponse = await this.adsApi.get(`/v2/reports/${reportId}`);
      
      if (statusResponse.data.status === 'SUCCESS' && statusResponse.data.location) {
        // Download the report from the location URL
        const reportData = await axios.get(statusResponse.data.location, {
          decompress: true,
          responseType: 'json'
        });
        
        if (reportData.data && Array.isArray(reportData.data)) {
          for (const metric of reportData.data) {
            await this.saveCampaignMetrics(metric);
          }
          logger.info(`Saved metrics for ${reportData.data.length} campaigns`);
        }
      } else if (statusResponse.data.status === 'IN_PROGRESS') {
        // Retry after delay
        setTimeout(() => {
          this.downloadReport(reportId);
        }, 5000);
      } else {
        logger.warn(`Report ${reportId} status: ${statusResponse.data.status}`);
      }
    } catch (error: any) {
      logger.error('Failed to download report:', error.response?.data || error.message);
    }
  }

  // Support Ads Reporting v3 flow
  private async requestV3ReportAndIngest(date: Date): Promise<void> {
    try {
      // Amazon Ads v3 expects YYYYMMDD in many cases; also supports date ranges
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const d = String(date.getUTCDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;

      const body = {
        name: `sp-campaigns-${y}${m}${d}`,
        startDate: dateStr,
        endDate: dateStr,
        configuration: {
          adProduct: 'SPONSORED_PRODUCTS',
          groupBy: ['campaign'],
          columns: [
            'campaignId',
            'impressions',
            'clicks',
            'cost',
            'purchases14d',
            'sales14d',
            'date'
          ]
        }
      };

      const createResp = await this.adsApi.post('/reporting/reports', body, {
        headers: {
          Accept: 'application/json',
        }
      });

      const reportId = createResp.data?.reportId || createResp.data?.id;
      if (!reportId) {
        logger.warn('V3 report creation did not return a reportId');
        return;
      }

      logger.info(`V3 report requested: ${reportId}`);

      // Poll with backoff up to ~60s total
      let attempt = 0;
      let url: string | undefined;
      while (attempt < 6 && !url) {
        const delay = Math.min(15000, 2000 * Math.pow(2, attempt));
        await new Promise(res => setTimeout(res, delay));
        const statusResp = await this.adsApi.get(`/reporting/reports/${reportId}`, {
          headers: { Accept: 'application/json' }
        });
        const status = statusResp.data?.status || statusResp.data?.processingStatus;
        url = statusResp.data?.url || statusResp.data?.location;
        logger.info(`V3 report status: ${status} (attempt=${attempt + 1})`);
        if (status === 'FAILURE') break;
        attempt++;
      }

      if (!url) {
        logger.warn('V3 report did not become ready in time');
        return;
      }

      const reportData = await axios.get(url, { responseType: 'json', decompress: true });
      const items = Array.isArray(reportData.data) ? reportData.data : [];
      let saved = 0;
      for (const item of items) {
        // Normalize v3 fields to v2-like payload for saveCampaignMetrics
        const norm = {
          campaignId: item.campaignId || item.campaign_id,
          date: item.date || `${y}-${m}-${d}`,
          impressions: item.impressions ?? 0,
          clicks: item.clicks ?? 0,
          cost: item.cost ?? 0,
          attributedConversions14d: item.purchases14d ?? item.conversions14d ?? 0,
          attributedSales14d: item.sales14d ?? item.attributedSales14d ?? 0,
        };
        await this.saveCampaignMetrics(norm);
        saved++;
      }
      logger.info(`V3 report ingested: ${saved} campaign rows.`);
    } catch (err: any) {
      logger.error('V3 reporting flow failed:', err.response?.data || err.message);
    }
  }

  private async saveCampaign(campaignData: any): Promise<void> {
    try {
      const query = `
        INSERT INTO advertising_campaigns (
          campaign_id, name, campaign_type, targeting_type,
          state, daily_budget, start_date, end_date,
          bidding_strategy, portfolio_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        ON CONFLICT (campaign_id) 
        DO UPDATE SET 
          name = EXCLUDED.name,
          state = EXCLUDED.state,
          daily_budget = EXCLUDED.daily_budget,
          updated_at = NOW()
      `;

      const values = [
        campaignData.campaignId,
        campaignData.name,
        campaignData.campaignType || 'sponsoredProducts',
        campaignData.targetingType,
        campaignData.state,
        campaignData.dailyBudget,
        campaignData.startDate,
        campaignData.endDate || null,
        campaignData.bidding?.strategy || 'legacyForSales',
        campaignData.portfolioId || null
      ];

      await pool.query(query, values);
    } catch (error) {
      logger.error('Failed to save campaign:', error);
    }
  }

  private async saveCampaignMetrics(metricsData: any): Promise<void> {
    try {
      const query = `
        INSERT INTO advertising_metrics (
          campaign_id, date, impressions, clicks,
          cost, conversions, sales, acos,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        ON CONFLICT (campaign_id, date) 
        DO UPDATE SET 
          impressions = EXCLUDED.impressions,
          clicks = EXCLUDED.clicks,
          cost = EXCLUDED.cost,
          conversions = EXCLUDED.conversions,
          sales = EXCLUDED.sales,
          acos = EXCLUDED.acos,
          updated_at = NOW()
      `;

      const acos = metricsData.attributedSales14d > 0 
        ? (metricsData.cost / metricsData.attributedSales14d * 100) 
        : 0;

      const values = [
        metricsData.campaignId,
        metricsData.date,
        metricsData.impressions || 0,
        metricsData.clicks || 0,
        metricsData.cost || 0,
        metricsData.attributedConversions14d || 0,
        metricsData.attributedSales14d || 0,
        acos
      ];

      await pool.query(query, values);
    } catch (error) {
      logger.error('Failed to save campaign metrics:', error);
    }
  }

  async stop(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    
    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval);
      this.tokenRefreshInterval = null;
    }
    
    logger.info('Simple Amazon Ads service stopped');
  }
}
