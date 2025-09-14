import axios from 'axios';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

interface MlCreds {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  sellerId: string;
}

interface MLItem {
  id: string;
  title: string;
  seller_custom_field?: string;
  available_quantity: number;
  status: string;
  site_id: string;
  user_product_id?: string;
  variations?: Array<{
    id: string;
    seller_custom_field?: string;
    available_quantity: number;
    user_product_id?: string;
  }>;
}

interface StockResult {
  success: boolean;
  quantity: number;
  error?: string;
  skipUpdate?: boolean;
}

interface RateLimitConfig {
  baseDelay: number;
  maxDelay: number;
  retryAttempts: number;
}

interface VariationWithValidation {
  id: string;
  seller_custom_field?: string;
  available_quantity: number;
  user_product_id?: string;
  hasValidStock: boolean; // CRITICAL FIX PROBLEM 2: Per-variation validation
  stockFetchError?: string;
}

interface MLItemWithMeta {
  item: MLItem & {
    variations?: VariationWithValidation[];
  };
  stockFetchErrors: string[];
  hasValidStock: boolean; // Keep for simple items without variations
}



class MercadoLivreInventorySyncService {
  private accessToken: string | null = null;
  private accessTokenExpiry: number | null = null;
  private rateLimitConfig: RateLimitConfig = {
    baseDelay: 100,
    maxDelay: 30000,
    retryAttempts: 3
  };
  private consecutiveErrors = 0;

  private async getCredentials(): Promise<MlCreds> {
    const res = await pool.query(
      `SELECT credential_key, credential_value FROM ml_credentials WHERE is_active = true`
    );
    const map: Record<string, string> = {};
    for (const r of res.rows) map[r.credential_key] = r.credential_value;

    const clientId = map.ML_CLIENT_ID || process.env.ML_CLIENT_ID;
    const clientSecret = map.ML_CLIENT_SECRET || process.env.ML_CLIENT_SECRET;
    const refreshToken = map.ML_REFRESH_TOKEN;
    const sellerId = map.ML_SELLER_ID || map.ML_USER_ID;

    if (!clientId || !clientSecret || !refreshToken || !sellerId) {
      throw new Error('Missing Mercado Livre credentials (ML_CLIENT_ID/ML_CLIENT_SECRET/ML_REFRESH_TOKEN/ML_SELLER_ID)');
    }
    return { clientId, clientSecret, refreshToken, sellerId };
  }

  private async refreshAccessToken(force = false): Promise<string> {
    if (!force && this.accessToken && this.accessTokenExpiry && Date.now() < this.accessTokenExpiry) {
      return this.accessToken;
    }

    const { clientId, clientSecret, refreshToken } = await this.getCredentials();

    const params = new URLSearchParams();
    params.set('grant_type', 'refresh_token');
    params.set('client_id', clientId);
    params.set('client_secret', clientSecret);
    params.set('refresh_token', refreshToken);

    // CRITICAL FIX PROBLEM 1: Wrap OAuth token refresh with performRequestWithBackoff for 429/5xx handling
    const data = await this.performRequestWithBackoff(async () => {
      const resp = await axios.post('https://api.mercadolibre.com/oauth/token', params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
        validateStatus: () => true, // Handle all status codes manually
      });

      if (resp.status !== 200) {
        throw new Error(`OAuth token refresh failed: HTTP ${resp.status}: ${resp.statusText}`);
      }

      return resp.data || {};
    }, 'refreshAccessToken');

    this.accessToken = data.access_token;
    const expiresInSec = Number(data.expires_in || 0);
    this.accessTokenExpiry = Date.now() + Math.max(0, (expiresInSec - 60) * 1000);

    return this.accessToken!;
  }

  private async getAccessToken(): Promise<string> {
    try {
      return await this.refreshAccessToken(false);
    } catch (e) {
      logger.warn('Failed cached ML access token, forcing refresh');
      return await this.refreshAccessToken(true);
    }
  }

  /**
   * Calculate delay with exponential backoff
   */
  private calculateBackoffDelay(attempt: number, retryAfter?: number): number {
    if (retryAfter && retryAfter > 0) {
      return Math.min(retryAfter * 1000, this.rateLimitConfig.maxDelay);
    }
    
    const delay = this.rateLimitConfig.baseDelay * Math.pow(2, attempt);
    return Math.min(delay, this.rateLimitConfig.maxDelay);
  }

  /**
   * Perform HTTP request with exponential backoff and rate limiting
   */
  private async performRequestWithBackoff<T>(
    requestFn: () => Promise<T>,
    context: string
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= this.rateLimitConfig.retryAttempts; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.calculateBackoffDelay(attempt - 1);
          logger.debug(`${context}: Retrying after ${delay}ms (attempt ${attempt})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        return await requestFn();
      } catch (error: any) {
        lastError = error;
        
        // Handle rate limiting with Retry-After header
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'];
          const delay = this.calculateBackoffDelay(attempt, parseInt(retryAfter || '0'));
          
          logger.warn(`${context}: Rate limited (429), waiting ${delay}ms`);
          
          if (attempt < this.rateLimitConfig.retryAttempts) {
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        // For other errors, only retry on network/temporary issues
        if (
          error.code === 'ECONNRESET' ||
          error.code === 'ETIMEDOUT' ||
          error.response?.status >= 500
        ) {
          if (attempt < this.rateLimitConfig.retryAttempts) {
            continue;
          }
        }
        
        // Don't retry on client errors (400-499, except 429)
        break;
      }
    }
    
    throw lastError;
  }

  private async createInventoryTableIfNotExists(): Promise<void> {
    try {
      const sql = `
        CREATE TABLE IF NOT EXISTS ml_inventory (
          item_id text NOT NULL,
          variation_id text DEFAULT '',
          seller_sku text,
          available_quantity integer NOT NULL DEFAULT 0,
          title text,
          status text,
          site_id text,
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (item_id, variation_id)
        );

        CREATE INDEX IF NOT EXISTS idx_ml_inventory_seller_sku ON ml_inventory(seller_sku);
        CREATE INDEX IF NOT EXISTS idx_ml_inventory_status ON ml_inventory(status);
      `;
      await pool.query(sql);
      logger.info('✅ ml_inventory table ready');
    } catch (error) {
      logger.error('Failed to create ml_inventory table:', error);
      throw error;
    }
  }

  private async fetchSellerItems(sellerId: string, accessToken: string): Promise<string[]> {
    const itemIds: string[] = [];
    let offset = 0;
    const limit = 100;

    try {
      for (let page = 0; page < 50; page++) { // Safety cap
        const context = `fetchSellerItems(page=${page})`;
        
        const result = await this.performRequestWithBackoff(async () => {
          const url = `https://api.mercadolibre.com/users/${sellerId}/items/search?status=active&search_type=scan&limit=${limit}&offset=${offset}`;
          
          const resp = await axios.get(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 30000,
            validateStatus: () => true,
          });

          if (resp.status === 401) {
            await this.refreshAccessToken(true);
            throw new Error('Token refresh required');
          }

          if (resp.status !== 200) {
            throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
          }

          return resp.data;
        }, context);

        const results: string[] = result.results || [];
        
        if (results.length === 0) break;
        
        itemIds.push(...results);
        
        const paging = result.paging || {};
        if (!paging.total || offset + limit >= paging.total) break;
        
        offset += limit;
      }
    } catch (error) {
      logger.error('Error fetching seller items:', error);
    }

    return itemIds;
  }

  private async fetchItemsDetails(itemIds: string[], accessToken: string): Promise<MLItem[]> {
    const items: MLItem[] = [];
    const batchSize = 20;

    for (let i = 0; i < itemIds.length; i += batchSize) {
      const batch = itemIds.slice(i, i + batchSize);
      const idsParam = batch.join(',');
      const context = `fetchItemsDetails(batch=${i}-${i + batchSize})`;
      
      try {
        const result = await this.performRequestWithBackoff(async () => {
          const url = `https://api.mercadolibre.com/items?ids=${idsParam}`;
          
          const resp = await axios.get(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 30000,
            validateStatus: () => true,
          });

          if (resp.status === 401) {
            await this.refreshAccessToken(true);
            throw new Error('Token refresh required');
          }

          if (resp.status !== 200) {
            throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
          }

          return resp.data;
        }, context);

        const responses = result || [];
        
        for (const itemResp of responses) {
          if (itemResp.code === 200 && itemResp.body) {
            items.push(itemResp.body as MLItem);
          }
        }
      } catch (error) {
        logger.error(`Error fetching items batch ${i}-${i + batchSize}:`, error);
      }
    }

    return items;
  }


  /**
   * Parse stock data with robust validation - CRITICAL: Returns success=false when no valid nodes
   */
  private parseStockData(stockData: any): { success: boolean; quantity: number; error?: string } {
    try {
      let stockNodes: any[] = [];
      
      // Validate input
      if (!stockData) {
        return { success: false, quantity: 0, error: 'Empty stock data' };
      }
      
      // Handle different response formats with validation
      if (Array.isArray(stockData)) {
        stockNodes = stockData;
      } else if (stockData && Array.isArray(stockData.stock)) {
        stockNodes = stockData.stock;
      } else if (stockData && typeof stockData === 'object') {
        // Extract array values with validation
        const keys = Object.keys(stockData);
        for (const key of keys) {
          if (Array.isArray(stockData[key])) {
            stockNodes = stockData[key];
            break;
          }
        }
      }
      
      if (!Array.isArray(stockNodes)) {
        return { success: false, quantity: 0, error: 'Invalid stock data format' };
      }
      
      // Sum all valid stock nodes (prioritize FULL nodes but accept others)
      let totalStock = 0;
      let validNodesFound = 0;
      let hasFullNodes = false;
      
      // FULL node type aliases
      const fullNodeTypes = ['meli_facility', 'fulfillment', 'meli_fulfillment', 'ml_full'];
      
      for (const node of stockNodes) {
        if (node && typeof node === 'object') {
          let quantityValue = null;
          
          // Extract quantity - support nested quantity objects
          if (typeof node.quantity === 'number' && !isNaN(node.quantity)) {
            quantityValue = node.quantity;
          } else if (node.quantity && typeof node.quantity === 'object') {
            // Handle nested quantity objects (typical for FULL)
            quantityValue = node.quantity.available ?? 
                           node.quantity.for_sale ?? 
                           node.quantity.sellable ?? 
                           node.quantity.quantity;
          } else {
            // Fallback to direct fields
            quantityValue = node.available ?? node.available_quantity;
          }
          
          if (typeof quantityValue === 'number' && !isNaN(quantityValue)) {
            const isFullNode = fullNodeTypes.includes(node.type);
            
            if (isFullNode) {
              hasFullNodes = true;
              totalStock += Math.max(0, quantityValue); // Ensure non-negative
              validNodesFound++;
              logger.debug(`FULL node found: type=${node.type}, quantity=${quantityValue}`);
            } else if (!hasFullNodes) {
              // Only count non-FULL if no FULL nodes found
              totalStock += Math.max(0, quantityValue);
              validNodesFound++;
              logger.debug(`Non-FULL node: type=${node.type}, quantity=${quantityValue}`);
            }
          }
        }
      }
      
      // Accept any valid stock nodes
      if (validNodesFound === 0) {
        return {
          success: false,
          quantity: 0,
          error: 'No valid stock nodes found - cannot determine stock'
        };
      }
      
      return {
        success: true,
        quantity: totalStock
      };
    } catch (error) {
      return {
        success: false,
        quantity: 0,
        error: `Parse error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get real stock from Full (meli_facility) for a user_product_id with proper error handling
   */
  private async getUserProductStock(userProductId: string, accessToken: string): Promise<StockResult> {
    const context = `getUserProductStock(${userProductId})`;
    
    try {
      const result = await this.performRequestWithBackoff(async () => {
        const url = `https://api.mercadolibre.com/user-products/${userProductId}/stock`;
        
        const resp = await axios.get(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 15000,
          validateStatus: () => true,
        });

        if (resp.status === 401) {
          await this.refreshAccessToken(true);
          throw new Error('Token refresh required');
        }

        if (resp.status !== 200) {
          throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        }

        return resp.data;
      }, context);
      
      const parseResult = this.parseStockData(result);
      
      if (!parseResult.success) {
        logger.warn(`${context}: ${parseResult.error}`);
        return {
          success: false,
          quantity: 0,
          error: parseResult.error,
          skipUpdate: true // Don't update DB with invalid data
        };
      }
      
      logger.debug(`${context}: Full stock = ${parseResult.quantity}`);
      return {
        success: true,
        quantity: parseResult.quantity
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`${context}: ${errorMsg}`);
      
      // CRITICAL: Return error result instead of 0 to prevent data loss
      return {
        success: false,
        quantity: 0,
        error: errorMsg,
        skipUpdate: true // Don't overwrite valid stock data
      };
    }
  }

  /**
   * Get actual stock for items/variations using user_product_id with proper error handling
   * CRITICAL FIX PROBLEM 2: Per-variation validation instead of item-level
   */
  private async getActualStockForItems(items: MLItem[], accessToken: string): Promise<MLItemWithMeta[]> {
    const itemsWithMeta: MLItemWithMeta[] = [];
    this.consecutiveErrors = 0;

    for (const item of items) {
      const stockFetchErrors: string[] = [];
      let hasValidStock = true; // Keep for simple items without variations
      
      try {
        const itemWithStock: MLItem & { variations?: VariationWithValidation[] } = {
          ...item,
          variations: undefined // Will be set properly below
        };

        // Handle items with variations
        if (item.variations && item.variations.length > 0) {
          const variationsWithValidation: VariationWithValidation[] = [];
          
          for (const variation of item.variations) {
            let variationError: string | undefined;
            
            if (variation.user_product_id) {
              const stockResult = await this.getUserProductStock(variation.user_product_id, accessToken);
              
              if (stockResult.success) {
                variationsWithValidation.push({
                  ...variation,
                  available_quantity: stockResult.quantity,
                  hasValidStock: true // CRITICAL: Individual validation per variation
                });
                this.consecutiveErrors = 0; // Reset on success
              } else {
                // CRITICAL: Keep original data when stock fetch fails
                variationsWithValidation.push({
                  ...variation,
                  hasValidStock: false, // CRITICAL: Individual validation per variation
                  stockFetchError: stockResult.error
                });
                variationError = `Variation ${variation.id}: ${stockResult.error}`;
                stockFetchErrors.push(variationError);
                this.consecutiveErrors++;
              }
            } else {
              // CRITICAL FIX: Missing user_product_id means unreliable stock - mark as invalid
              variationsWithValidation.push({
                ...variation,
                hasValidStock: false, // CRITICAL: Individual validation per variation
                stockFetchError: 'Missing user_product_id - cannot determine stock'
              });
              variationError = `Variation ${variation.id}: Missing user_product_id - cannot determine stock`;
              stockFetchErrors.push(variationError);
            }
            
            // Adaptive rate limiting based on error rate
            const delay = Math.max(50, this.calculateBackoffDelay(Math.min(this.consecutiveErrors, 3)));
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          
          itemWithStock.variations = variationsWithValidation;
          // For items with variations, hasValidStock indicates if ANY variation is valid
          hasValidStock = variationsWithValidation.some(v => v.hasValidStock);
        } else {
          // Handle simple items
          if (item.user_product_id) {
            const stockResult = await this.getUserProductStock(item.user_product_id, accessToken);
            
            if (stockResult.success) {
              itemWithStock.available_quantity = stockResult.quantity;
              this.consecutiveErrors = 0; // Reset on success
              hasValidStock = true;
            } else {
              // CRITICAL: Keep original data when stock fetch fails
              stockFetchErrors.push(`Item: ${stockResult.error}`);
              hasValidStock = false;
              this.consecutiveErrors++;
            }
          } else {
            // CRITICAL FIX: Missing user_product_id means unreliable stock - mark as invalid
            stockFetchErrors.push('Item: Missing user_product_id - cannot determine stock');
            hasValidStock = false; // CRITICAL: Mark as invalid to prevent data corruption
          }
        }

        itemsWithMeta.push({
          item: itemWithStock,
          stockFetchErrors,
          hasValidStock
        });
      } catch (error) {
        logger.error(`Error processing stock for item ${item.id}:`, error);
        this.consecutiveErrors++;
        
        // Add item without stock correction as fallback
        const fallbackItem: MLItem & { variations?: VariationWithValidation[] } = {
          ...item,
          variations: undefined // Will be set properly below
        };
        if (item.variations && item.variations.length > 0) {
          // Convert variations to VariationWithValidation for fallback
          fallbackItem.variations = item.variations.map(v => ({
            ...v,
            hasValidStock: false,
            stockFetchError: 'Processing error - could not validate stock'
          }));
        }
        
        itemsWithMeta.push({
          item: fallbackItem,
          stockFetchErrors: [`Processing error: ${error instanceof Error ? error.message : 'Unknown'}`],
          hasValidStock: false
        });
      }
    }

    return itemsWithMeta;
  }

  /**
   * CRITICAL: Upsert inventory data with error-aware logic to prevent data loss
   */
  private async upsertInventoryData(itemsWithMeta: MLItemWithMeta[]): Promise<{ updated: number; skipped: number; errors: number }> {
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const { item, stockFetchErrors, hasValidStock } of itemsWithMeta) {
      try {
        // Handle items with variations
        if (item.variations && item.variations.length > 0) {
          for (const variation of item.variations) {
            try {
              const isNew = await this.isNewRecord(item.id, variation.id || '');
              
              // CRITICAL FIX PROBLEM 2: Use individual variation validation instead of item-level
              // Only update if THIS SPECIFIC VARIATION has valid stock OR it's a new record
              if (variation.hasValidStock && variation.user_product_id) {
                await pool.query(`
                  INSERT INTO ml_inventory (
                    item_id, variation_id, seller_sku, available_quantity, 
                    title, status, site_id, updated_at
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                  ON CONFLICT (item_id, variation_id)
                  DO UPDATE SET 
                    seller_sku = EXCLUDED.seller_sku,
                    available_quantity = EXCLUDED.available_quantity,
                    title = EXCLUDED.title,
                    status = EXCLUDED.status,
                    site_id = EXCLUDED.site_id,
                    updated_at = NOW()
                `, [
                  item.id,
                  variation.id || '',
                  variation.seller_custom_field || item.seller_custom_field,
                  variation.available_quantity || 0,
                  item.title,
                  item.status,
                  item.site_id
                ]);
                updated++;
              } else if (isNew && variation.user_product_id) {
                // Allow initial insert even with stock errors, but only if user_product_id exists
                await pool.query(`
                  INSERT INTO ml_inventory (
                    item_id, variation_id, seller_sku, available_quantity, 
                    title, status, site_id, updated_at
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                  ON CONFLICT (item_id, variation_id) DO NOTHING
                `, [
                  item.id,
                  variation.id || '',
                  variation.seller_custom_field || item.seller_custom_field,
                  variation.available_quantity || 0,
                  item.title,
                  item.status,
                  item.site_id
                ]);
                updated++;
              } else {
                const reason = !variation.user_product_id ? 'missing user_product_id' : 'stock fetch errors';
                logger.info(`Skipped variation ${item.id}/${variation.id} due to ${reason}`);
                skipped++;
              }
            } catch (error) {
              logger.error(`Failed to upsert variation ${item.id}/${variation.id}:`, error);
              errors++;
            }
          }
        } else {
          try {
            const isNew = await this.isNewRecord(item.id, '');
            
            // CRITICAL: Strict validation - only update if we have valid stock OR it's a new record
            // AND user_product_id exists (hasValidStock ensures this)
            if (hasValidStock && item.user_product_id) {
              await pool.query(`
                INSERT INTO ml_inventory (
                  item_id, variation_id, seller_sku, available_quantity, 
                  title, status, site_id, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                ON CONFLICT (item_id, variation_id)
                DO UPDATE SET 
                  seller_sku = EXCLUDED.seller_sku,
                  available_quantity = EXCLUDED.available_quantity,
                  title = EXCLUDED.title,
                  status = EXCLUDED.status,
                  site_id = EXCLUDED.site_id,
                  updated_at = NOW()
              `, [
                item.id,
                '', // No variation - use empty string
                item.seller_custom_field,
                item.available_quantity || 0,
                item.title,
                item.status,
                item.site_id
              ]);
              updated++;
            } else if (isNew && item.user_product_id) {
              // Allow initial insert even with stock errors, but only if user_product_id exists
              await pool.query(`
                INSERT INTO ml_inventory (
                  item_id, variation_id, seller_sku, available_quantity, 
                  title, status, site_id, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                ON CONFLICT (item_id, variation_id) DO NOTHING
              `, [
                item.id,
                '', // No variation - use empty string
                item.seller_custom_field,
                item.available_quantity || 0,
                item.title,
                item.status,
                item.site_id
              ]);
              updated++;
            } else {
              const reason = !item.user_product_id ? 'missing user_product_id' : 'stock fetch errors';
              logger.info(`Skipped item ${item.id} due to ${reason}`);
              skipped++;
            }
          } catch (error) {
            logger.error(`Failed to upsert item ${item.id}:`, error);
            errors++;
          }
        }
        
        // Log stock fetch errors for monitoring
        if (stockFetchErrors.length > 0) {
          logger.warn(`Stock fetch issues for ${item.id}: ${stockFetchErrors.join(', ')}`);
        }
      } catch (error) {
        logger.error(`Failed to process item ${item.id}:`, error);
        errors++;
      }
    }
    
    return { updated, skipped, errors };
  }
  
  /**
   * Check if this is a new record (to allow initial inserts even with errors)
   */
  private async isNewRecord(itemId: string, variationId: string): Promise<boolean> {
    try {
      const result = await pool.query(
        'SELECT 1 FROM ml_inventory WHERE item_id = $1 AND variation_id = $2 LIMIT 1',
        [itemId, variationId]
      );
      return result.rows.length === 0;
    } catch (error) {
      logger.warn(`Error checking if record exists for ${itemId}/${variationId}:`, error);
      return true; // Err on the side of allowing inserts
    }
  }

  async syncInventory(): Promise<{ total: number; synced: number }> {
    try {
      logger.info('🔄 Starting Mercado Livre inventory sync...');
      
      await this.createInventoryTableIfNotExists();
      
      const { sellerId } = await this.getCredentials();
      const accessToken = await this.getAccessToken();
      
      logger.info(`📦 Fetching items for seller ${sellerId}...`);
      const itemIds = await this.fetchSellerItems(sellerId, accessToken);
      
      if (itemIds.length === 0) {
        logger.warn('No active items found for seller');
        return { total: 0, synced: 0 };
      }
      
      logger.info(`🔍 Fetching details for ${itemIds.length} items...`);
      const items = await this.fetchItemsDetails(itemIds, accessToken);
      
      logger.info(`📊 Getting real stock from Full for ${items.length} items...`);
      const itemsWithMeta = await this.getActualStockForItems(items, accessToken);
      
      logger.info(`💾 Updating inventory for ${itemsWithMeta.length} items...`);
      const updateResult = await this.upsertInventoryData(itemsWithMeta);
      
      logger.info(`✅ ML inventory sync completed: ${items.length} items processed, ${updateResult.updated} updated, ${updateResult.skipped} skipped, ${updateResult.errors} errors`);
      
      return { total: itemIds.length, synced: updateResult.updated };
    } catch (error) {
      logger.error('ML inventory sync failed:', error);
      throw error;
    }
  }
}

export const mercadoLivreInventorySyncService = new MercadoLivreInventorySyncService();