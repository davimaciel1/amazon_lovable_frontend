import axios from 'axios';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { mercadoLivreInventorySyncService } from './mercadolivre-inventory-sync.service';

interface MLWebhookPayload {
  user_id: string;
  topic: string;
  resource: string;
  application_id: string;
  attempts: number;
  sent: string;
  received: string;
}

interface StockUpdatePayload {
  item_id: string;
  variation_id?: string;
  available_quantity: number;
  status: string;
  title?: string;
  seller_sku?: string;
  site_id?: string;
}

class MercadoLivreWebhookService {
  private accessToken: string | null = null;
  private accessTokenExpiry: number | null = null;
  private tableEnsured = false;

  /**
   * Garantir que a tabela de webhook logs existe
   */
  private async ensureWebhookLogsTable() {
    if (this.tableEnsured) return;
    
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ml_webhook_logs (
          id BIGSERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          topic TEXT NOT NULL,
          resource TEXT NOT NULL,
          application_id TEXT,
          attempts INTEGER DEFAULT 0,
          sent_at TIMESTAMPTZ,
          received_at TIMESTAMPTZ,
          processed_at TIMESTAMPTZ DEFAULT NOW(),
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_ml_webhook_logs_resource_topic_sent 
        ON ml_webhook_logs (resource, topic, sent_at);
        CREATE INDEX IF NOT EXISTS idx_ml_webhook_logs_topic 
        ON ml_webhook_logs (topic, created_at);
      `);
      
      this.tableEnsured = true;
      logger.info('✅ ml_webhook_logs table ready');
    } catch (error) {
      logger.error('❌ Failed to create ml_webhook_logs table:', error);
      throw error;
    }
  }

  private async getCredentials() {
    const res = await pool.query(
      `SELECT credential_key, credential_value FROM ml_credentials WHERE is_active = true`
    );
    const map: Record<string, string> = {};
    for (const r of res.rows) map[r.credential_key] = r.credential_value;

    const clientId = map.ML_CLIENT_ID || process.env.MERCADOLIVRE_APP_ID;
    const clientSecret = map.ML_CLIENT_SECRET || process.env.MERCADOLIVRE_APP_SECRET;
    const refreshToken = map.ML_REFRESH_TOKEN;
    const sellerId = map.ML_SELLER_ID || map.ML_USER_ID;

    if (!clientId || !clientSecret || !refreshToken || !sellerId) {
      throw new Error('Missing Mercado Livre credentials');
    }
    return { clientId: clientId!, clientSecret: clientSecret!, refreshToken: refreshToken!, sellerId: sellerId! };
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
    this.accessTokenExpiry = Date.now() + (expiresInSec - 300) * 1000; // 5min buffer

    if (!this.accessToken) {
      throw new Error('Failed to get access token from ML API');
    }

    logger.info('✅ ML access token refreshed for webhook service');
    return this.accessToken;
  }

  /**
   * Processa webhook de notificação do Mercado Livre
   */
  async processWebhook(payload: MLWebhookPayload): Promise<{ success: boolean; action?: string; error?: string }> {
    try {
      logger.info(`📢 Processing ML webhook: ${payload.topic} - ${payload.resource}`);

      // Verificar se é um webhook relevante para estoque
      if (!this.isStockRelevantTopic(payload.topic)) {
        return { success: true, action: 'ignored_topic' };
      }

      // Log do webhook recebido
      await this.logWebhook(payload);

      // Processar baseado no tópico
      switch (payload.topic) {
        case 'items':
          return await this.handleItemUpdate(payload);
        case 'orders':
          return await this.handleOrderUpdate(payload);
        default:
          return { success: true, action: 'topic_not_handled' };
      }
    } catch (error) {
      logger.error('❌ Error processing ML webhook:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Verifica se o tópico do webhook é relevante para estoque
   */
  private isStockRelevantTopic(topic: string): boolean {
    const relevantTopics = ['items', 'orders'];
    return relevantTopics.includes(topic);
  }

  /**
   * Log do webhook para auditoria
   */
  private async logWebhook(payload: MLWebhookPayload) {
    try {
      await this.ensureWebhookLogsTable();
      
      await pool.query(`
        INSERT INTO ml_webhook_logs (
          user_id, topic, resource, application_id, 
          attempts, sent_at, received_at, processed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (resource, topic, sent_at) DO NOTHING
      `, [
        payload.user_id,
        payload.topic,
        payload.resource,
        payload.application_id,
        payload.attempts,
        payload.sent,
        payload.received
      ]);
      
      logger.debug(`📝 Webhook logged: ${payload.topic} - ${payload.resource}`);
    } catch (error) {
      logger.warn('Failed to log webhook:', error);
    }
  }

  /**
   * Processa atualização de item (produto)
   */
  private async handleItemUpdate(payload: MLWebhookPayload): Promise<{ success: boolean; action: string }> {
    const itemId = payload.resource.split('/').pop();
    
    if (!itemId) {
      return { success: false, action: 'invalid_item_id' };
    }

    logger.info(`🔄 Syncing stock for item ${itemId} due to webhook`);

    try {
      // Buscar informações atualizadas do item
      const itemData = await this.fetchItemData(itemId);
      
      if (!itemData) {
        return { success: false, action: 'item_not_found' };
      }

      // Atualizar estoque local
      await this.updateLocalStock(itemData);

      // Disparar sincronização completa se necessário
      await this.triggerInventorySyncIfNeeded(itemId);

      return { success: true, action: 'stock_updated' };
    } catch (error) {
      logger.error(`❌ Failed to handle item update for ${itemId}:`, error);
      return { success: false, action: 'update_failed' };
    }
  }

  /**
   * Processa atualização de pedido
   */
  private async handleOrderUpdate(payload: MLWebhookPayload): Promise<{ success: boolean; action: string }> {
    const orderId = payload.resource.split('/').pop();
    
    if (!orderId) {
      return { success: false, action: 'invalid_order_id' };
    }

    logger.info(`📦 Processing order update ${orderId} for stock impact`);

    try {
      // Buscar dados do pedido
      const orderData = await this.fetchOrderData(orderId);
      
      if (!orderData || !this.shouldUpdateStockForOrder(orderData)) {
        return { success: true, action: 'no_stock_impact' };
      }

      // Atualizar estoque baseado nos itens do pedido
      await this.updateStockFromOrder(orderData);

      return { success: true, action: 'stock_updated_from_order' };
    } catch (error) {
      logger.error(`❌ Failed to handle order update for ${orderId}:`, error);
      return { success: false, action: 'order_update_failed' };
    }
  }

  /**
   * Busca dados do item via API do ML
   */
  private async fetchItemData(itemId: string) {
    try {
      const token = await this.refreshAccessToken();
      const response = await axios.get(`https://api.mercadolibre.com/items/${itemId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 10000
      });
      
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch item ${itemId}:`, error);
      return null;
    }
  }

  /**
   * Busca dados do pedido via API do ML
   */
  private async fetchOrderData(orderId: string) {
    try {
      const token = await this.refreshAccessToken();
      const response = await axios.get(`https://api.mercadolibre.com/orders/${orderId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 10000
      });
      
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch order ${orderId}:`, error);
      return null;
    }
  }

  /**
   * Atualiza estoque local com dados do item
   */
  private async updateLocalStock(itemData: any) {
    try {
      const updates = [];
      
      // Item principal
      if (itemData.available_quantity !== undefined) {
        updates.push({
          item_id: itemData.id,
          available_quantity: itemData.available_quantity,
          status: itemData.status,
          title: itemData.title,
          seller_sku: itemData.seller_sku,
          site_id: itemData.site_id
        });
      }

      // Variações
      if (itemData.variations && itemData.variations.length > 0) {
        for (const variation of itemData.variations) {
          updates.push({
            item_id: itemData.id,
            variation_id: variation.id,
            available_quantity: variation.available_quantity,
            status: itemData.status,
            title: itemData.title,
            seller_sku: variation.seller_sku || itemData.seller_sku,
            site_id: itemData.site_id
          });
        }
      }

      // Aplicar updates
      for (const update of updates) {
        await this.upsertStockData(update);
      }

      logger.info(`✅ Updated local stock for item ${itemData.id} (${updates.length} records)`);
    } catch (error) {
      logger.error('Failed to update local stock:', error);
      throw error;
    }
  }

  /**
   * Upsert de dados de estoque na tabela local
   */
  private async upsertStockData(data: StockUpdatePayload) {
    // Handle NULL variation_id by converting to empty string to match table DEFAULT
    const variationId = data.variation_id || '';
    
    const query = `
      INSERT INTO ml_inventory (
        item_id, variation_id, available_quantity, status,
        title, seller_sku, site_id, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (item_id, variation_id)
      DO UPDATE SET
        available_quantity = EXCLUDED.available_quantity,
        status = EXCLUDED.status,
        title = EXCLUDED.title,
        seller_sku = EXCLUDED.seller_sku,
        site_id = EXCLUDED.site_id,
        updated_at = NOW()
    `;

    await pool.query(query, [
      data.item_id,
      variationId,
      data.available_quantity,
      data.status,
      data.title || null,
      data.seller_sku || null,
      data.site_id || null
    ]);
  }

  /**
   * Verifica se o pedido deve impactar o estoque
   */
  private shouldUpdateStockForOrder(orderData: any): boolean {
    // Apenas pedidos confirmados/pagos devem impactar estoque
    const stockImpactStatuses = ['confirmed', 'payment_required', 'payment_in_process', 'paid', 'delivered'];
    return stockImpactStatuses.includes(orderData.status);
  }

  /**
   * Atualiza estoque baseado nos itens do pedido
   */
  private async updateStockFromOrder(orderData: any) {
    try {
      if (!orderData.order_items || orderData.order_items.length === 0) {
        return;
      }

      for (const item of orderData.order_items) {
        // Buscar dados atuais do item para garantir sincronização
        const itemData = await this.fetchItemData(item.item.id);
        if (itemData) {
          await this.updateLocalStock(itemData);
        }
      }

      logger.info(`✅ Updated stock from order ${orderData.id}`);
    } catch (error) {
      logger.error('Failed to update stock from order:', error);
      throw error;
    }
  }

  /**
   * Dispara sincronização completa se necessário
   */
  private async triggerInventorySyncIfNeeded(itemId: string) {
    try {
      // Verificar se item precisa de sincronização completa
      const shouldSync = await this.checkIfFullSyncNeeded(itemId);
      
      if (shouldSync) {
        logger.info(`🔄 Triggering full inventory sync due to significant changes in ${itemId}`);
        // Usar o serviço existente para sincronização
        setImmediate(() => {
          mercadoLivreInventorySyncService.syncInventory().catch(error => {
            logger.error('Background inventory sync failed:', error);
          });
        });
      }
    } catch (error) {
      logger.warn('Failed to check if full sync needed:', error);
    }
  }

  /**
   * Verifica se sincronização completa é necessária
   */
  private async checkIfFullSyncNeeded(itemId: string): Promise<boolean> {
    try {
      // Verificar se há discrepâncias significativas
      const result = await pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN updated_at < NOW() - INTERVAL '1 hour' THEN 1 END) as potentially_outdated
        FROM ml_inventory 
        WHERE item_id = $1
      `, [itemId]);

      const { potentially_outdated } = result.rows[0];
      
      // Se há registros potencialmente desatualizados (mais de 1 hora), fazer sync completo
      return parseInt(potentially_outdated) > 0;
    } catch (error) {
      logger.warn('Failed to check sync status:', error);
      return false;
    }
  }

  /**
   * Atualiza estoque no ML (sincronização reversa)
   */
  async updateMLStock(itemId: string, variationId: string | null, quantity: number): Promise<{ success: boolean; error?: string }> {
    try {
      const token = await this.refreshAccessToken();
      
      let url = `https://api.mercadolibre.com/items/${itemId}`;
      let payload: any = { available_quantity: quantity };

      if (variationId) {
        url = `https://api.mercadolibre.com/items/${itemId}/variations/${variationId}`;
      }

      await axios.put(url, payload, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      logger.info(`✅ Updated ML stock: ${itemId}${variationId ? `/${variationId}` : ''} = ${quantity}`);
      return { success: true };
    } catch (error: any) {
      logger.error(`❌ Failed to update ML stock for ${itemId}:`, error);
      return { 
        success: false, 
        error: error.response?.data?.message || error.message 
      };
    }
  }

  /**
   * Sincronização bidirecional: Local → ML
   */
  async syncLocalToML(itemId?: string): Promise<{ success: boolean; updated: number; errors: number }> {
    try {
      let query = `
        SELECT item_id, variation_id, available_quantity, status
        FROM ml_inventory
        WHERE status = 'active' AND updated_at > NOW() - INTERVAL '5 minutes'
      `;
      const params: any[] = [];

      if (itemId) {
        query += ` AND item_id = $1`;
        params.push(itemId);
      }

      query += ` LIMIT 100`; // Processar em lotes

      const result = await pool.query(query, params);
      let updated = 0;
      let errors = 0;

      for (const row of result.rows) {
        const updateResult = await this.updateMLStock(
          row.item_id,
          row.variation_id,
          row.available_quantity
        );

        if (updateResult.success) {
          updated++;
          // Marcar como sincronizado
          await pool.query(
            `UPDATE ml_inventory SET updated_at = NOW() WHERE item_id = $1 AND variation_id = $2`,
            [row.item_id, row.variation_id || '']
          );
        } else {
          errors++;
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      logger.info(`🔄 Local→ML sync completed: ${updated} updated, ${errors} errors`);
      return { success: true, updated, errors };
    } catch (error) {
      logger.error('❌ Failed to sync local to ML:', error);
      throw error;
    }
  }
}

export const mercadoLivreWebhookService = new MercadoLivreWebhookService();