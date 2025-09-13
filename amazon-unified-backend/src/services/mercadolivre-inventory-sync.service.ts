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
  variations?: Array<{
    id: string;
    seller_custom_field?: string;
    available_quantity: number;
  }>;
}

class MercadoLivreInventorySyncService {
  private accessToken: string | null = null;
  private accessTokenExpiry: number | null = null;

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

    const resp = await axios.post('https://api.mercadolibre.com/oauth/token', params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    });

    const data = resp.data || {};
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
        const url = `https://api.mercadolibre.com/users/${sellerId}/items/search?status=active&search_type=scan&limit=${limit}&offset=${offset}`;
        
        const resp = await axios.get(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 30000,
          validateStatus: () => true,
        });

        if (resp.status === 401) {
          await this.refreshAccessToken(true);
          continue;
        }

        if (resp.status !== 200) {
          logger.warn(`ML items search failed: ${resp.status}`);
          break;
        }

        const data = resp.data || {};
        const results: string[] = data.results || [];
        
        if (results.length === 0) break;
        
        itemIds.push(...results);
        
        const paging = data.paging || {};
        if (!paging.total || offset + limit >= paging.total) break;
        
        offset += limit;
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
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
      
      try {
        const url = `https://api.mercadolibre.com/items?ids=${idsParam}`;
        
        const resp = await axios.get(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 30000,
          validateStatus: () => true,
        });

        if (resp.status === 401) {
          await this.refreshAccessToken(true);
          continue;
        }

        if (resp.status !== 200) {
          logger.warn(`ML items details failed: ${resp.status}`);
          continue;
        }

        const responses = resp.data || [];
        
        for (const itemResp of responses) {
          if (itemResp.code === 200 && itemResp.body) {
            items.push(itemResp.body as MLItem);
          }
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        logger.error(`Error fetching items batch ${i}-${i + batchSize}:`, error);
      }
    }

    return items;
  }

  private async upsertInventoryData(items: MLItem[]): Promise<void> {
    for (const item of items) {
      try {
        // Handle items with variations
        if (item.variations && item.variations.length > 0) {
          for (const variation of item.variations) {
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
          }
        } else {
          // Handle simple items without variations
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
        }
      } catch (error) {
        logger.error(`Failed to upsert inventory for item ${item.id}:`, error);
      }
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
      
      logger.info(`💾 Updating inventory for ${items.length} items...`);
      await this.upsertInventoryData(items);
      
      logger.info(`✅ ML inventory sync completed: ${items.length} items processed`);
      
      return { total: itemIds.length, synced: items.length };
    } catch (error) {
      logger.error('ML inventory sync failed:', error);
      throw error;
    }
  }
}

export const mercadoLivreInventorySyncService = new MercadoLivreInventorySyncService();