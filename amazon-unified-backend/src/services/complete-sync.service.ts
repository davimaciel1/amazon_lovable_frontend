/**
 * Complete Amazon Synchronization Service
 * Features:
 * - Full synchronization of ALL products
 * - Rate limit compliance (Amazon SP-API: 2 requests/second)
 * - Progress tracking and resume capability
 * - Automatic retry with exponential backoff
 * - Persistent state management
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const SellingPartner = require('amazon-sp-api');
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

interface SyncProgress {
  lastProcessedAsin: string | null;
  totalAsins: number;
  processedAsins: number;
  failedAsins: string[];
  startedAt: string;
  lastUpdatedAt: string;
  status: 'running' | 'paused' | 'completed' | 'failed';
}

export class CompleteSyncService {
  private sp: any;
  private progressFile: string;
  private syncProgress: SyncProgress;
  private rateLimitDelay: number = 550; // 550ms between requests (safer than 500ms for 2/sec limit)
  private maxRetries: number = 3;
  private isRunning: boolean = false;

  constructor() {
    this.progressFile = path.join(__dirname, '../../sync-progress.json');
    this.syncProgress = this.loadProgress();
    
    // Initialize SP-API only if credentials are available
    if (process.env.SP_API_REFRESH_TOKEN && process.env.SP_API_APP_CLIENT_ID) {
      try {
        this.sp = new SellingPartner({
          region: (process.env.SP_API_REGION || 'na') as 'na' | 'eu' | 'fe',
          refresh_token: process.env.SP_API_REFRESH_TOKEN!,
          credentials: {
            SELLING_PARTNER_APP_CLIENT_ID: process.env.SP_API_APP_CLIENT_ID!,
            SELLING_PARTNER_APP_CLIENT_SECRET: process.env.SP_API_APP_CLIENT_SECRET!,
            AWS_SELLING_PARTNER_ROLE: process.env.SP_API_ROLE_ARN!
          } as any,
          options: {
            auto_request_tokens: true,
            use_sandbox: false
          }
        });
        logger.info('SP-API client initialized successfully');
      } catch (error) {
        logger.warn('Failed to initialize SP-API client:', error);
        this.sp = null;
      }
    } else {
      logger.info('SP-API credentials not provided - running in demo mode');
      this.sp = null;
    }
  }

  /**
   * Load sync progress from file
   */
  private loadProgress(): SyncProgress {
    try {
      if (fs.existsSync(this.progressFile)) {
        const data = fs.readFileSync(this.progressFile, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      logger.error('Failed to load progress file:', error);
    }

    // Return default progress
    return {
      lastProcessedAsin: null,
      totalAsins: 0,
      processedAsins: 0,
      failedAsins: [],
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      status: 'running'
    };
  }

  /**
   * Save sync progress to file
   */
  private saveProgress(): void {
    try {
      this.syncProgress.lastUpdatedAt = new Date().toISOString();
      fs.writeFileSync(
        this.progressFile,
        JSON.stringify(this.syncProgress, null, 2)
      );
    } catch (error) {
      logger.error('Failed to save progress:', error);
    }
  }

  /**
   * Start or resume complete synchronization
   */
  async startSync(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Sync is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting complete product synchronization...');

    try {
      // Get all unique ASINs from the database
      const asins = await this.getAllAsins();
      this.syncProgress.totalAsins = asins.length;

      logger.info(`Found ${asins.length} unique ASINs to process`);

      // Find starting point
      let startIndex = 0;
      if (this.syncProgress.lastProcessedAsin) {
        const lastIndex = asins.findIndex(a => a === this.syncProgress.lastProcessedAsin);
        if (lastIndex >= 0) {
          startIndex = lastIndex + 1;
          logger.info(`Resuming from ASIN ${this.syncProgress.lastProcessedAsin} (index ${startIndex})`);
        }
      }

      // Process each ASIN
      for (let i = startIndex; i < asins.length; i++) {
        if (!this.isRunning) {
          logger.info('Sync paused by user');
          this.syncProgress.status = 'paused';
          this.saveProgress();
          break;
        }

        const asin = asins[i];
        await this.processAsin(asin);
        
        // Update progress
        this.syncProgress.lastProcessedAsin = asin;
        this.syncProgress.processedAsins++;
        
        // Save progress every 10 products
        if (i % 10 === 0) {
          this.saveProgress();
          const percentage = ((i / asins.length) * 100).toFixed(2);
          logger.info(`Progress: ${i}/${asins.length} (${percentage}%) - Last: ${asin}`);
        }

        // Rate limiting
        await this.delay(this.rateLimitDelay);
      }

      // Mark as completed if we processed everything
      if (this.syncProgress.processedAsins >= this.syncProgress.totalAsins) {
        this.syncProgress.status = 'completed';
        logger.info('✅ Complete synchronization finished successfully!');
        
        // Clean up progress file
        if (fs.existsSync(this.progressFile)) {
          fs.unlinkSync(this.progressFile);
        }
      }

    } catch (error) {
      logger.error('Sync failed:', error);
      this.syncProgress.status = 'failed';
      this.saveProgress();
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get all unique ASINs from orders and products
   */
  private async getAllAsins(): Promise<string[]> {
    const query = `
      SELECT DISTINCT asin FROM (
        SELECT DISTINCT asin FROM order_items WHERE asin IS NOT NULL
        UNION
        SELECT DISTINCT asin FROM products WHERE asin IS NOT NULL
      ) combined
      ORDER BY asin
    `;

    const result = await pool.query(query);
    return result.rows.map(row => row.asin);
  }

  /**
   * Process a single ASIN with retry logic
   */
  private async processAsin(asin: string): Promise<void> {
    let retries = 0;
    let lastError: any = null;

    while (retries < this.maxRetries) {
      try {
        // Check if product already exists with image
        const existing = await pool.query(
          'SELECT id, image_url FROM products WHERE asin = $1',
          [asin]
        );

        if (existing.rows.length > 0 && existing.rows[0].image_url) {
          logger.debug(`ASIN ${asin} already has image, skipping`);
          return;
        }

        // Fetch product details from Amazon
        const productData = await this.fetchProductFromAmazon(asin);
        
        if (productData) {
          await this.saveProduct(asin, productData);
          logger.info(`✅ Synced: ${asin} - ${productData.title?.substring(0, 50)}...`);
        }
        
        return; // Success, exit retry loop

      } catch (error: any) {
        lastError = error;
        retries++;

        if (error.code === 'TooManyRequests' || error.statusCode === 429) {
          // Rate limit hit - exponential backoff
          const backoffTime = Math.min(1000 * Math.pow(2, retries), 30000);
          logger.warn(`Rate limit hit for ${asin}, waiting ${backoffTime}ms (retry ${retries}/${this.maxRetries})`);
          await this.delay(backoffTime);
        } else if (error.code === 'InvalidInput' || error.statusCode === 400) {
          // Invalid ASIN - skip it
          logger.error(`Invalid ASIN ${asin}, skipping`);
          this.syncProgress.failedAsins.push(asin);
          return;
        } else {
          // Other error - retry with standard backoff
          const backoffTime = 1000 * retries;
          logger.error(`Error processing ${asin}, retry ${retries}/${this.maxRetries}:`, error.message);
          await this.delay(backoffTime);
        }
      }
    }

    // Max retries reached
    logger.error(`Failed to process ${asin} after ${this.maxRetries} retries:`, lastError);
    this.syncProgress.failedAsins.push(asin);
  }

  /**
   * Fetch product details from Amazon SP-API
   */
  private async fetchProductFromAmazon(asin: string): Promise<any> {
    try {
      // Try new API version first
      const response = await this.sp.callAPI({
        operation: 'getCatalogItem',
        endpoint: 'catalogItems',
        path: `/catalog/2022-04-01/items/${asin}` as any,
        query: {
          marketplaceIds: (process.env.SP_API_MARKETPLACE_IDS || 'ATVPDKIKX0DER').split(',') as any,
          includedData: 'identifiers,images,productTypes,salesRanks,summaries,variations,attributes'
        }
      });

      if (response) {
        return this.parseProductData(response);
      }
    } catch (error: any) {
      // If 404, ASIN doesn't exist
      if (error.statusCode === 404) {
        logger.warn(`ASIN ${asin} not found in Amazon catalog`);
        return null;
      }
      throw error; // Re-throw for retry logic
    }
  }

  /**
   * Parse product data from Amazon response
   */
  private parseProductData(response: any): any {
    const data = response;
    const result: any = {
      title: null,
      brand: null,
      category: null,
      imageUrl: null,
      price: null
    };

    // Extract title
    if (data.summaries?.length > 0) {
      result.title = data.summaries[0].itemName || null;
      result.brand = data.summaries[0].brand || null;
    }

    // Extract images
    if (data.images?.length > 0) {
      const primaryImage = data.images.find((img: any) => img.variant === 'MAIN');
      if (primaryImage?.link) {
        result.imageUrl = primaryImage.link;
      } else if (data.images[0]?.link) {
        result.imageUrl = data.images[0].link;
      }
    }

    // Extract category
    if (data.productTypes?.length > 0) {
      result.category = data.productTypes[0].productType || 'General';
    }

    // Extract price if available
    if (data.attributes?.list_price?.length > 0) {
      result.price = parseFloat(data.attributes.list_price[0].value) || null;
    }

    return result;
  }

  /**
   * Save or update product in database
   */
  private async saveProduct(asin: string, productData: any): Promise<void> {
    // Get additional info from order_items if needed
    const orderInfo = await pool.query(`
      SELECT 
        MAX(title) as title,
        MAX(sku) as sku,
        SUM(quantity_ordered) as total_quantity,
        SUM(item_price) as total_revenue
      FROM order_items
      WHERE asin = $1
      GROUP BY asin
    `, [asin]);

    const orderData = orderInfo.rows[0] || {};

    const query = `
      INSERT INTO products (
        asin,
        sku,
        title,
        brand,
        category,
        image_url,
        price,
        total_units_sold,
        total_revenue,
        is_active,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, NOW(), NOW())
      ON CONFLICT (asin) 
      DO UPDATE SET
        title = COALESCE(EXCLUDED.title, products.title),
        brand = COALESCE(EXCLUDED.brand, products.brand),
        category = COALESCE(EXCLUDED.category, products.category),
        image_url = COALESCE(EXCLUDED.image_url, products.image_url),
        price = COALESCE(EXCLUDED.price, products.price),
        updated_at = NOW()
    `;

    const values = [
      asin,
      orderData.sku || `PROD-${asin.slice(-6)}`,
      productData.title || orderData.title || `Product ${asin}`,
      productData.brand || 'Unknown',
      productData.category || 'General',
      productData.imageUrl || null,
      productData.price || null,
      orderData.total_quantity || 0,
      orderData.total_revenue || 0
    ];

    await pool.query(query, values);
  }

  /**
   * Pause the synchronization
   */
  async pauseSync(): Promise<void> {
    logger.info('Pausing synchronization...');
    this.isRunning = false;
  }

  /**
   * Get current sync status
   */
  getSyncStatus(): SyncProgress {
    return this.syncProgress;
  }

  /**
   * Reset sync progress
   */
  async resetProgress(): Promise<void> {
    if (fs.existsSync(this.progressFile)) {
      fs.unlinkSync(this.progressFile);
    }
    this.syncProgress = this.loadProgress();
    logger.info('Sync progress reset');
  }

  /**
   * Helper function to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}