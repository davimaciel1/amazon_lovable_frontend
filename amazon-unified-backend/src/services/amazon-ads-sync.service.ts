/**
 * Amazon Advertising API Synchronization Service
 * Fetches advertising data and campaign metrics
 */

import axios, { AxiosInstance } from 'axios';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

export class AmazonAdsSyncService {
  private adsApi: AxiosInstance;
  private accessToken: string = '';
  private refreshToken: string;
  private syncInterval: NodeJS.Timeout | null = null;
  private tokenRefreshInterval: NodeJS.Timeout | null = null;

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
      const profileId = process.env.ADS_API_PROFILE_ID;
      if (profileId) {
        config.headers['Amazon-Advertising-API-Scope'] = profileId;
      }
      
      return config;
    });
  }

  async initialize(): Promise<void> {
    try {
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

      logger.info('Amazon Ads sync service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Amazon Ads sync service:', error);
      throw error;
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
        // Save new refresh token to database or env
        await this.saveRefreshToken(response.data.refresh_token);
      }

      logger.info('Ads API access token refreshed successfully');
    } catch (error) {
      logger.error('Failed to refresh Ads API access token:', error);
      throw error;
    }
  }

  private async saveRefreshToken(token: string): Promise<void> {
    try {
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
      await Promise.allSettled([
        this.syncCampaigns(),
        this.syncAdGroups(),
        this.syncKeywords(),
        this.syncProductAds(),
        this.syncCampaignMetrics()
      ]);

      logger.info('Amazon Ads data sync completed');
    } catch (error) {
      logger.error('Ads sync failed:', error);
      throw error;
    }
  }

  async syncCampaigns(): Promise<void> {
    try {
      logger.info('Syncing advertising campaigns...');

      const response = await this.adsApi.get('/v2/sp/campaigns', {
        params: {
          stateFilter: 'enabled,paused',
          count: 1000
        }
      });

      if (response.data && response.data.length > 0) {
        for (const campaign of response.data) {
          await this.saveCampaign(campaign);
        }
        
        logger.info(`Synced ${response.data.length} campaigns`);
      }
    } catch (error) {
      logger.error('Campaign sync failed:', error);
    }
  }

  async syncAdGroups(): Promise<void> {
    try {
      logger.info('Syncing ad groups...');

      const response = await this.adsApi.get('/v2/sp/adGroups', {
        params: {
          stateFilter: 'enabled,paused',
          count: 1000
        }
      });

      if (response.data && response.data.length > 0) {
        for (const adGroup of response.data) {
          await this.saveAdGroup(adGroup);
        }
        
        logger.info(`Synced ${response.data.length} ad groups`);
      }
    } catch (error) {
      logger.error('Ad group sync failed:', error);
    }
  }

  async syncKeywords(): Promise<void> {
    try {
      logger.info('Syncing keywords...');

      const response = await this.adsApi.get('/v2/sp/keywords', {
        params: {
          stateFilter: 'enabled,paused',
          count: 1000
        }
      });

      if (response.data && response.data.length > 0) {
        for (const keyword of response.data) {
          await this.saveKeyword(keyword);
        }
        
        logger.info(`Synced ${response.data.length} keywords`);
      }
    } catch (error) {
      logger.error('Keyword sync failed:', error);
    }
  }

  async syncProductAds(): Promise<void> {
    try {
      logger.info('Syncing product ads...');

      const response = await this.adsApi.get('/v2/sp/productAds', {
        params: {
          stateFilter: 'enabled,paused',
          count: 1000
        }
      });

      if (response.data && response.data.length > 0) {
        for (const productAd of response.data) {
          await this.saveProductAd(productAd);
        }
        
        logger.info(`Synced ${response.data.length} product ads`);
      }
    } catch (error) {
      logger.error('Product ads sync failed:', error);
    }
  }

  async syncCampaignMetrics(): Promise<void> {
    try {
      logger.info('Syncing campaign metrics...');

      // Get metrics for the last 7 days
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);

      const reportRequest = {
        reportDate: endDate.toISOString().split('T')[0],
        metrics: [
          'impressions',
          'clicks', 
          'cost',
          'attributedConversions14d',
          'attributedSales14d',
          'attributedSales14dSameSKU'
        ]
      };

      // Request campaign performance report
      const reportResponse = await this.adsApi.post('/v2/sp/campaigns/report', reportRequest);
      
      if (reportResponse.data.reportId) {
        // Wait for report to be ready and download
        const reportData = await this.downloadReport(reportResponse.data.reportId);
        
        if (reportData) {
          await this.saveCampaignMetrics(reportData);
          logger.info('Campaign metrics synced successfully');
        }
      }
    } catch (error) {
      logger.error('Campaign metrics sync failed:', error);
    }
  }

  private async downloadReport(reportId: string): Promise<any> {
    try {
      // Check report status
      let attempts = 0;
      const maxAttempts = 30;
      
      while (attempts < maxAttempts) {
        const statusResponse = await this.adsApi.get(`/v2/reports/${reportId}`);
        
        if (statusResponse.data.status === 'SUCCESS') {
          // Download the report
          const downloadResponse = await this.adsApi.get(`/v2/reports/${reportId}/download`, {
            responseType: 'stream'
          });
          
          return downloadResponse.data;
        } else if (statusResponse.data.status === 'FAILURE') {
          throw new Error('Report generation failed');
        }
        
        // Wait before next attempt
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
      }
      
      throw new Error('Report timeout');
    } catch (error) {
      logger.error('Failed to download report:', error);
      return null;
    }
  }

  private async saveCampaign(campaignData: any): Promise<void> {
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
  }

  private async saveAdGroup(adGroupData: any): Promise<void> {
    const query = `
      INSERT INTO advertising_ad_groups (
        ad_group_id, campaign_id, name, state,
        default_bid, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT (ad_group_id) 
      DO UPDATE SET 
        name = EXCLUDED.name,
        state = EXCLUDED.state,
        default_bid = EXCLUDED.default_bid,
        updated_at = NOW()
    `;

    const values = [
      adGroupData.adGroupId,
      adGroupData.campaignId,
      adGroupData.name,
      adGroupData.state,
      adGroupData.defaultBid
    ];

    await pool.query(query, values);
  }

  private async saveKeyword(keywordData: any): Promise<void> {
    const query = `
      INSERT INTO advertising_keywords (
        keyword_id, ad_group_id, campaign_id, keyword_text,
        match_type, state, bid, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      ON CONFLICT (keyword_id) 
      DO UPDATE SET 
        keyword_text = EXCLUDED.keyword_text,
        state = EXCLUDED.state,
        bid = EXCLUDED.bid,
        updated_at = NOW()
    `;

    const values = [
      keywordData.keywordId,
      keywordData.adGroupId,
      keywordData.campaignId,
      keywordData.keywordText,
      keywordData.matchType,
      keywordData.state,
      keywordData.bid
    ];

    await pool.query(query, values);
  }

  private async saveProductAd(productAdData: any): Promise<void> {
    const query = `
      INSERT INTO advertising_product_ads (
        ad_id, ad_group_id, campaign_id, asin,
        sku, state, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      ON CONFLICT (ad_id) 
      DO UPDATE SET 
        state = EXCLUDED.state,
        updated_at = NOW()
    `;

    const values = [
      productAdData.adId,
      productAdData.adGroupId,
      productAdData.campaignId,
      productAdData.asin,
      productAdData.sku || null,
      productAdData.state
    ];

    await pool.query(query, values);
  }

  private async saveCampaignMetrics(metricsData: any): Promise<void> {
    // Process and save metrics data
    for (const metric of metricsData) {
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

      const acos = metric.attributedSales14d > 0 
        ? (metric.cost / metric.attributedSales14d * 100) 
        : 0;

      const values = [
        metric.campaignId,
        metric.date,
        metric.impressions,
        metric.clicks,
        metric.cost,
        metric.attributedConversions14d,
        metric.attributedSales14d,
        acos
      ];

      await pool.query(query, values);
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
    
    logger.info('Amazon Ads sync service stopped');
  }
}