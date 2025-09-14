import express from 'express';
import { mercadoLivreBidirectionalSyncService } from '../services/mercadolivre-bidirectional-sync.service';
import { requireApiKey } from '../middleware/apiKey.middleware';
import { logger } from '../utils/logger';

const router = express.Router();

/**
 * POST /api/ml/bidirectional-sync/full
 * Sincronização completa bidirecional (ML ↔ Local)
 */
router.post('/full', requireApiKey, async (_req, res) => {
  try {
    logger.info('🔄 Full bidirectional sync requested via API');
    const result = await mercadoLivreBidirectionalSyncService.fullBidirectionalSync();
    
    return res.json({
      ok: true,
      message: 'Full bidirectional sync completed',
      results: result
    });
  } catch (error) {
    logger.error('❌ Full bidirectional sync API error:', error);
    return res.status(500).json({
      ok: false,
      error: (error as Error).message || 'Sync failed'
    });
  }
});

/**
 * POST /api/ml/bidirectional-sync/ml-to-local
 * Sincronizar apenas ML → Local
 */
router.post('/ml-to-local', requireApiKey, async (_req, res) => {
  try {
    logger.info('📥 ML → Local sync requested via API');
    const result = await mercadoLivreBidirectionalSyncService.syncMLToLocal();
    
    return res.json({
      ok: true,
      message: 'ML to Local sync completed',
      result
    });
  } catch (error) {
    logger.error('❌ ML → Local sync API error:', error);
    return res.status(500).json({
      ok: false,
      error: (error as Error).message || 'ML to Local sync failed'
    });
  }
});

/**
 * POST /api/ml/bidirectional-sync/local-to-ml
 * Sincronizar apenas Local → ML
 */
router.post('/local-to-ml', requireApiKey, async (_req, res) => {
  try {
    logger.info('📤 Local → ML sync requested via API');
    const result = await mercadoLivreBidirectionalSyncService.syncLocalToML();
    
    return res.json({
      ok: true,
      message: 'Local to ML sync completed',
      result
    });
  } catch (error) {
    logger.error('❌ Local → ML sync API error:', error);
    return res.status(500).json({
      ok: false,
      error: (error as Error).message || 'Local to ML sync failed'
    });
  }
});

/**
 * POST /api/ml/bidirectional-sync/smart
 * Sincronização inteligente (detecta mudanças automaticamente)
 * Body opcional: { item_id?: string }
 */
router.post('/smart', requireApiKey, async (req, res) => {
  try {
    const { item_id } = req.body || {};
    
    logger.info(`🧠 Smart sync requested${item_id ? ` for item ${item_id}` : ''}`);
    const result = await mercadoLivreBidirectionalSyncService.smartSync(item_id);
    
    return res.json({
      ok: true,
      message: 'Smart sync completed',
      result
    });
  } catch (error) {
    logger.error('❌ Smart sync API error:', error);
    return res.status(500).json({
      ok: false,
      error: (error as Error).message || 'Smart sync failed'
    });
  }
});

/**
 * GET /api/ml/bidirectional-sync/status
 * Status da sincronização (estatísticas)
 */
router.get('/status', requireApiKey, async (_req, res) => {
  try {
    // Buscar estatísticas de sincronização
    const stats = await getSyncStats();
    
    return res.json({
      ok: true,
      status: stats
    });
  } catch (error) {
    logger.error('❌ Sync status API error:', error);
    return res.status(500).json({
      ok: false,
      error: 'Failed to fetch sync status'
    });
  }
});

/**
 * Buscar estatísticas de sincronização
 */
async function getSyncStats() {
  const { pool } = await import('../config/database');
  
  const queries = await Promise.allSettled([
    // Total de itens
    pool.query(`
      SELECT COUNT(*) as total_items
      FROM ml_inventory
    `),
    
    // Itens atualizados recentemente (últimas 24 horas)
    pool.query(`
      SELECT COUNT(*) as pending_local_changes
      FROM ml_inventory 
      WHERE updated_at > NOW() - INTERVAL '24 hours'
    `),
    
    // Itens atualizados recentemente (última hora)
    pool.query(`
      SELECT COUNT(*) as recently_synced
      FROM ml_inventory 
      WHERE updated_at > NOW() - INTERVAL '1 hour'
    `),
    
    // Itens com estoque ativo
    pool.query(`
      SELECT COUNT(*) as active_items
      FROM ml_inventory 
      WHERE status = 'active' AND available_quantity > 0
    `),
    
    // Último update timestamp
    pool.query(`
      SELECT MAX(updated_at) as last_sync
      FROM ml_inventory 
      WHERE updated_at IS NOT NULL
    `)
  ]);

  return {
    total_items: queries[0].status === 'fulfilled' ? parseInt(queries[0].value.rows[0]?.total_items || '0') : 0,
    pending_local_changes: queries[1].status === 'fulfilled' ? parseInt(queries[1].value.rows[0]?.pending_local_changes || '0') : 0,
    recently_synced: queries[2].status === 'fulfilled' ? parseInt(queries[2].value.rows[0]?.recently_synced || '0') : 0,
    active_items: queries[3].status === 'fulfilled' ? parseInt(queries[3].value.rows[0]?.active_items || '0') : 0,
    last_sync: queries[4].status === 'fulfilled' ? queries[4].value.rows[0]?.last_sync : null,
    sync_health: queries[1].status === 'fulfilled' ? 
      (parseInt(queries[1].value.rows[0]?.pending_local_changes || '0') > 0 ? 'active' : 'quiet') 
      : 'unknown'
  };
}

export const mlBidirectionalSyncRouter = router;