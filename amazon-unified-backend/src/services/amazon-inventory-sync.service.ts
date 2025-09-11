/**
 * Amazon Inventory Sync Service
 * Fetches REAL inventory data from Amazon SP-API
 */

import axios from 'axios';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

export class AmazonInventorySyncService {
  private accessToken: string = '';
  private refreshToken: string;
  private clientId: string;
  private clientSecret: string;
  private sellerId: string;
  private marketplaceId: string = 'ATVPDKIKX0DER'; // US marketplace
  private baseUrl: string = 'https://sellingpartnerapi-na.amazon.com';

  constructor() {
    this.refreshToken = process.env.SP_API_REFRESH_TOKEN || '';
    this.clientId = process.env.SP_API_CLIENT_ID || '';
    this.clientSecret = process.env.SP_API_CLIENT_SECRET || '';
    this.sellerId = process.env.AMAZON_SELLER_ID || '';
  }

  /**
   * Get LWA access token from refresh token
   */
  private async getAccessToken(): Promise<string> {
    try {
      const response = await axios.post(
        'https://api.amazon.com/auth/o2/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.accessToken = response.data.access_token;
      logger.info('✅ LWA access token obtained successfully');
      return this.accessToken;
    } catch (error: any) {
      logger.error('❌ Failed to get LWA access token:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Fetch inventory summaries from Amazon FBA
   */
  async fetchFBAInventory(): Promise<void> {
    try {
      logger.info('🔄 Starting FBA inventory sync...');
      
      // Get access token
      await this.getAccessToken();

      // Get all SKUs from database
      const skuResult = await pool.query(`
        SELECT DISTINCT 
          COALESCE(oi.seller_sku, oi.asin) as sku,
          oi.asin
        FROM order_items oi
        WHERE oi.asin IS NOT NULL
        ORDER BY sku
        LIMIT 50
      `);

      if (skuResult.rows.length === 0) {
        logger.warn('No SKUs found to sync inventory');
        return;
      }

      logger.info(`📦 Found ${skuResult.rows.length} SKUs to sync inventory`);

      // Fetch inventory for each SKU batch (max 50 per request)
      const batchSize = 50;
      for (let i = 0; i < skuResult.rows.length; i += batchSize) {
        const batch = skuResult.rows.slice(i, i + batchSize);
        const skus = batch.map(row => row.sku).join(',');
        
        try {
          const inventoryData = await this.fetchInventoryBatch(skus);
          await this.updateInventoryData(inventoryData, batch);
          
          // Rate limiting: 2 requests per second
          await new Promise(resolve => setTimeout(resolve, 550));
        } catch (error) {
          logger.error(`Failed to fetch inventory for batch ${i}:`, error);
        }
      }

      logger.info('✅ FBA inventory sync completed');
    } catch (error) {
      logger.error('❌ FBA inventory sync failed:', error);
    }
  }

  /**
   * Fetch inventory batch from Amazon
   */
  private async fetchInventoryBatch(sellerSkus: string): Promise<any> {
    try {
      const url = `${this.baseUrl}/fba/inventory/v1/summaries`;
      
      const params = new URLSearchParams({
        granularityType: 'Marketplace',
        granularityId: this.marketplaceId,
        marketplaceIds: this.marketplaceId,
        details: 'true',
        sellerSkus: sellerSkus
      });

      const response = await axios.get(url, {
        params,
        headers: {
          'x-amz-access-token': this.accessToken,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        // No inventory found for these SKUs
        return { inventorySummaries: [] };
      }
      throw error;
    }
  }

  /**
   * Update inventory data in database
   */
  private async updateInventoryData(data: any, skuMapping: any[]): Promise<void> {
    if (!data.inventorySummaries || data.inventorySummaries.length === 0) {
      logger.info('No inventory data found for this batch');
      return;
    }

    for (const inventory of data.inventorySummaries) {
      try {
        const sku = inventory.sellerSku;
        const asin = inventory.asin || skuMapping.find(m => m.sku === sku)?.asin;
        
        if (!asin) continue;

        const totalQuantity = 
          (inventory.inventoryDetails?.fulfillableQuantity || 0) +
          (inventory.inventoryDetails?.inboundWorkingQuantity || 0) +
          (inventory.inventoryDetails?.inboundShippedQuantity || 0) +
          (inventory.inventoryDetails?.inboundReceivingQuantity || 0);

        const reservedQuantity = 
          (inventory.inventoryDetails?.reservedQuantity?.totalReservedQuantity || 0);
        
        const availableQuantity = totalQuantity - reservedQuantity;

        // Update product inventory
        await pool.query(`
          UPDATE products 
          SET 
            inventory_quantity = $1,
            in_stock = $2,
            updated_at = NOW()
          WHERE asin = $3
        `, [availableQuantity, availableQuantity > 0, asin]);

        logger.info(`✅ Updated inventory for ASIN ${asin}: ${availableQuantity} units available`);
      } catch (error) {
        logger.error(`Failed to update inventory for SKU ${inventory.sellerSku}:`, error);
      }
    }
  }

  /**
   * Fetch inventory using Listings API (alternative method)
   */
  async fetchListingsInventory(): Promise<void> {
    try {
      logger.info('🔄 Starting Listings inventory sync...');
      
      // Get access token
      await this.getAccessToken();

      // Get all ASINs from database
      const asinResult = await pool.query(`
        SELECT DISTINCT asin, sku
        FROM products
        WHERE asin IS NOT NULL
        ORDER BY asin
        LIMIT 100
      `);

      if (asinResult.rows.length === 0) {
        logger.warn('No ASINs found to sync inventory');
        return;
      }

      logger.info(`📦 Found ${asinResult.rows.length} ASINs to sync inventory`);

      for (const row of asinResult.rows) {
        try {
          const listingData = await this.fetchListingItem(row.sku || row.asin);
          
          if (listingData && listingData.fulfillmentAvailability) {
            const quantity = listingData.fulfillmentAvailability[0]?.quantity || 0;
            
            await pool.query(`
              UPDATE products 
              SET 
                inventory_quantity = $1,
                in_stock = $2,
                updated_at = NOW()
              WHERE asin = $3
            `, [quantity, quantity > 0, row.asin]);

            logger.info(`✅ Updated inventory for ASIN ${row.asin}: ${quantity} units`);
          }
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 550));
        } catch (error) {
          logger.error(`Failed to fetch listing for ASIN ${row.asin}:`, error);
        }
      }

      logger.info('✅ Listings inventory sync completed');
    } catch (error) {
      logger.error('❌ Listings inventory sync failed:', error);
    }
  }

  /**
   * Fetch single listing item
   */
  private async fetchListingItem(sku: string): Promise<any> {
    try {
      const url = `${this.baseUrl}/listings/2021-08-01/items/${this.sellerId}/${sku}`;
      
      const response = await axios.get(url, {
        params: {
          marketplaceIds: this.marketplaceId,
          includedData: 'fulfillmentAvailability'
        },
        headers: {
          'x-amz-access-token': this.accessToken,
          'Accept': 'application/json'
        }
      });

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        // Listing not found
        return null;
      }
      throw error;
    }
  }

  /**
   * Main sync method - tries multiple approaches
   */
  async syncInventory(): Promise<void> {
    logger.info('🚀 Starting comprehensive inventory sync...');
    
    try {
      // Try FBA inventory first (most accurate for FBA items)
      await this.fetchFBAInventory();
    } catch (error) {
      logger.error('FBA inventory sync failed, trying Listings API:', error);
      
      // Fallback to Listings API
      try {
        await this.fetchListingsInventory();
      } catch (listingError) {
        logger.error('Listings inventory sync also failed:', listingError);
      }
    }
    
    // Show summary
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_products,
        COUNT(CASE WHEN inventory_quantity > 0 THEN 1 END) as products_with_stock,
        SUM(inventory_quantity) as total_units
      FROM products
    `);
    
    const stats = result.rows[0];
    logger.info('📊 Inventory Sync Summary:');
    logger.info(`   Total Products: ${stats.total_products}`);
    logger.info(`   Products with Stock: ${stats.products_with_stock}`);
    logger.info(`   Total Units in Stock: ${stats.total_units || 0}`);
  }
}

// Export singleton instance
export const inventorySyncService = new AmazonInventorySyncService();