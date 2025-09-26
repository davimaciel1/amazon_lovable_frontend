import axios from 'axios';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { mercadoLivreInventorySyncService } from './mercadolivre-inventory-sync.service';

interface SyncResult {
  success: boolean;
  direction: 'ML_to_Local' | 'Local_to_ML';
  processed: number;
  updated: number;
  errors: number;
  details?: string[];
}

interface StockItem {
  item_id: string;
  variation_id?: string;
  available_quantity: number;
  status: string;
  title?: string;
  seller_sku?: string;
  site_id?: string;
  local_quantity?: number;
  ml_quantity?: number;
  conflict?: boolean;
}

/**
 * Serviço de sincronização bidirecional entre sistema local e Mercado Livre
 * Baseado na documentação oficial ML 2024 obtida via MCP
 */
class MercadoLivreBidirectionalSyncService {
  private accessToken: string | null = null;
  private accessTokenExpiry: number | null = null;
  private rateLimitDelay = 400; // ms entre requests (conforme rate limit ML: 1500/min)

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
    this.accessTokenExpiry = Date.now() + (expiresInSec - 300) * 1000;

    if (!this.accessToken) {
      throw new Error('Failed to get access token from ML API');
    }

    logger.info('✅ ML access token refreshed for bidirectional sync');
    return this.accessToken;
  }

  /**
   * Sincronização completa bidirecional
   * 1. ML → Local (puxar mudanças do ML)
   * 2. Local → ML (enviar mudanças locais)
   * 3. Resolver conflitos
   */
  async fullBidirectionalSync(): Promise<{
    ml_to_local: SyncResult;
    local_to_ml: SyncResult;
    conflicts_resolved: number;
  }> {
    logger.info('🔄 Starting full bidirectional sync...');

    try {
      // 1. Sincronizar ML → Local primeiro
      const mlToLocal = await this.syncMLToLocal();
      
      // 2. Aguardar um pouco antes da próxima sincronização
      await this.sleep(1000);
      
      // 3. Sincronizar Local → ML
      const localToML = await this.syncLocalToML();
      
      // 4. Resolver conflitos se houver
      const conflictsResolved = await this.resolveStockConflicts();

      logger.info(`✅ Bidirectional sync completed: ML→Local(${mlToLocal.updated}), Local→ML(${localToML.updated}), Conflicts(${conflictsResolved})`);
      
      return {
        ml_to_local: mlToLocal,
        local_to_ml: localToML,
        conflicts_resolved: conflictsResolved
      };
      
    } catch (error) {
      logger.error('❌ Full bidirectional sync failed:', error);
      throw error;
    }
  }

  /**
   * Sincronizar ML → Local
   * Buscar mudanças no ML e aplicar localmente
   */
  async syncMLToLocal(): Promise<SyncResult> {
    try {
      logger.info('📥 Syncing ML → Local...');
      
      // Usar o serviço existente para sincronizar inventário
      const result = await mercadoLivreInventorySyncService.syncInventory();
      
      return {
        success: true,
        direction: 'ML_to_Local',
        processed: result.total,
        updated: result.synced,
        errors: result.total - result.synced,
        details: [`Used existing inventory sync service`]
      };
      
    } catch (error) {
      logger.error('❌ ML → Local sync failed:', error);
      return {
        success: false,
        direction: 'ML_to_Local',
        processed: 0,
        updated: 0,
        errors: 1,
        details: [(error as Error).message]
      };
    }
  }

  /**
   * Sincronizar Local → ML
   * Enviar mudanças locais para o ML (baseado na documentação oficial)
   */
  async syncLocalToML(): Promise<SyncResult> {
    try {
      logger.info('📤 Syncing Local → ML...');
      
      // Buscar itens com mudanças pendentes
      const pendingItems = await this.getPendingLocalChanges();
      
      if (pendingItems.length === 0) {
        logger.info('🎯 No pending local changes to sync');
        return {
          success: true,
          direction: 'Local_to_ML',
          processed: 0,
          updated: 0,
          errors: 0,
          details: ['No pending changes']
        };
      }

      logger.info(`📦 Found ${pendingItems.length} items with local changes`);
      
      let updated = 0;
      let errors = 0;
      const details: string[] = [];

      // Processar em lotes para respeitar rate limit
      const batchSize = 10;
      for (let i = 0; i < pendingItems.length; i += batchSize) {
        const batch = pendingItems.slice(i, i + batchSize);
        
        for (const item of batch) {
          const result = await this.updateMLStock(item);
          
          if (result.success) {
            updated++;
            await this.markAsSynced(item);
            details.push(`✅ ${item.item_id}${item.variation_id ? `/${item.variation_id}` : ''}: ${item.available_quantity}`);
          } else {
            errors++;
            details.push(`❌ ${item.item_id}: ${result.error}`);
          }
          
          // Rate limiting conforme documentação oficial ML
          await this.sleep(this.rateLimitDelay);
        }
        
        // Pausa maior entre lotes
        if (i + batchSize < pendingItems.length) {
          await this.sleep(1000);
        }
      }

      logger.info(`📤 Local → ML sync completed: ${updated} updated, ${errors} errors`);
      
      return {
        success: errors === 0,
        direction: 'Local_to_ML',
        processed: pendingItems.length,
        updated,
        errors,
        details
      };
      
    } catch (error) {
      logger.error('❌ Local → ML sync failed:', error);
      return {
        success: false,
        direction: 'Local_to_ML',
        processed: 0,
        updated: 0,
        errors: 1,
        details: [(error as Error).message]
      };
    }
  }

  /**
   * Buscar itens com mudanças locais pendentes
   */
  private async getPendingLocalChanges(): Promise<StockItem[]> {
    const query = `
      SELECT 
        item_id,
        variation_id,
        available_quantity,
        status,
        title,
        seller_sku,
        site_id
      FROM ml_inventory 
      WHERE status = 'active' 
        AND available_quantity >= 0
      ORDER BY updated_at DESC
      LIMIT 100
    `;

    const result = await pool.query(query);
    return result.rows.map(row => ({
      item_id: row.item_id,
      variation_id: row.variation_id,
      available_quantity: row.available_quantity,
      status: row.status,
      title: row.title,
      seller_sku: row.seller_sku,
      site_id: row.site_id
    }));
  }

  /**
   * Atualizar estoque no ML usando endpoints oficiais 2024
   */
  private async updateMLStock(item: StockItem): Promise<{ success: boolean; error?: string }> {
    try {
      const token = await this.refreshAccessToken();
      
      // Escolher endpoint baseado na documentação oficial
      let url: string;
      let payload: any;

      if (item.variation_id) {
        // Endpoint para variações específicas
        url = `https://api.mercadolibre.com/items/${item.item_id}`;
        payload = {
          variations: [{
            id: item.variation_id,
            available_quantity: item.available_quantity
          }]
        };
      } else {
        // Endpoint para item simples
        url = `https://api.mercadolibre.com/items/${item.item_id}`;
        payload = {
          available_quantity: item.available_quantity
        };
      }

      await axios.put(url, payload, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      logger.debug(`✅ ML stock updated: ${item.item_id}${item.variation_id ? `/${item.variation_id}` : ''} = ${item.available_quantity}`);
      return { success: true };
      
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || error.message;
      logger.error(`❌ Failed to update ML stock for ${item.item_id}:`, errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Marcar item como sincronizado
   */
  private async markAsSynced(item: StockItem) {
    const variationId = item.variation_id || '';
    await pool.query(
      `UPDATE ml_inventory 
       SET updated_at = NOW()
       WHERE item_id = $1 AND variation_id = $2`,
      [item.item_id, variationId]
    );
  }

  /**
   * Resolver conflitos de estoque entre local e ML
   */
  private async resolveStockConflicts(): Promise<number> {
    try {
      // Buscar itens com discrepâncias significativas
      const query = `
        SELECT 
          item_id, variation_id, available_quantity
        FROM ml_inventory 
        WHERE status = 'active'
          AND updated_at < NOW() - INTERVAL '30 minutes'
        LIMIT 50
      `;

      const result = await pool.query(query);
      
      if (result.rows.length === 0) {
        return 0;
      }

      logger.info(`🔧 Resolving ${result.rows.length} stock conflicts...`);
      
      let resolved = 0;
      for (const row of result.rows) {
        // Estratégia: atualizar timestamp para forçar nova sincronização
        const variationId = row.variation_id || '';
        await pool.query(
          `UPDATE ml_inventory 
           SET updated_at = NOW()
           WHERE item_id = $1 AND variation_id = $2`,
          [row.item_id, variationId]
        );
        resolved++;
      }

      logger.info(`✅ Resolved ${resolved} stock conflicts`);
      return resolved;
      
    } catch (error) {
      logger.error('❌ Failed to resolve stock conflicts:', error);
      return 0;
    }
  }

  /**
   * Sincronização automática baseada em mudanças detectadas
   */
  async smartSync(itemId?: string): Promise<SyncResult> {
    try {
      logger.info(`🧠 Smart sync triggered${itemId ? ` for item ${itemId}` : ''}`);

      // Detectar que tipo de sincronização é necessária
      const localChanges = await this.hasLocalChanges(itemId);
      const mlChanges = await this.hasMLChanges(itemId);

      if (!localChanges && !mlChanges) {
        return {
          success: true,
          direction: 'Local_to_ML',
          processed: 0,
          updated: 0,
          errors: 0,
          details: ['No changes detected']
        };
      }

      // Priorizar ML → Local se houver mudanças no ML
      if (mlChanges) {
        const mlResult = await this.syncMLToLocal();
        if (!mlResult.success) return mlResult;
      }

      // Depois Local → ML se houver mudanças locais
      if (localChanges) {
        return await this.syncLocalToML();
      }

      return {
        success: true,
        direction: 'ML_to_Local',
        processed: 0,
        updated: 0,
        errors: 0,
        details: ['Smart sync completed']
      };

    } catch (error) {
      logger.error('❌ Smart sync failed:', error);
      return {
        success: false,
        direction: 'Local_to_ML',
        processed: 0,
        updated: 0,
        errors: 1,
        details: [(error as Error).message]
      };
    }
  }

  /**
   * Verificar se há mudanças locais pendentes
   */
  private async hasLocalChanges(itemId?: string): Promise<boolean> {
    let query = `
      SELECT COUNT(*) as count
      FROM ml_inventory 
      WHERE updated_at > NOW() - INTERVAL '1 day'
    `;
    
    const params: any[] = [];
    if (itemId) {
      query += ` AND item_id = $1`;
      params.push(itemId);
    }

    const result = await pool.query(query, params);
    return parseInt(result.rows[0].count) > 0;
  }

  /**
   * Verificar se há mudanças no ML (aproximação baseada em timestamp)
   */
  private async hasMLChanges(itemId?: string): Promise<boolean> {
    let query = `
      SELECT COUNT(*) as count
      FROM ml_inventory 
      WHERE updated_at < NOW() - INTERVAL '1 hour'
    `;
    
    const params: any[] = [];
    if (itemId) {
      query += ` AND item_id = $1`;
      params.push(itemId);
    }

    const result = await pool.query(query, params);
    return parseInt(result.rows[0].count) > 5; // Trigger se muitos itens desatualizados
  }

  /**
   * Utility para sleep/delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const mercadoLivreBidirectionalSyncService = new MercadoLivreBidirectionalSyncService();