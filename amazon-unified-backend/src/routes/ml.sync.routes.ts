import express from 'express';
import { mercadoLivreSyncService } from '../services/mercadolivre-sync.service';
import { mercadoLivreInventorySyncService } from '../services/mercadolivre-inventory-sync.service';
import { optionalApiKey } from '../middleware/apiKey.middleware';
import { logger } from '../utils/logger';

const router = express.Router();

// POST /api/ml/sync/run
// Body: { from?: string (ISO), to?: string (ISO), status?: string }
router.post('/run', optionalApiKey, async (req, res) => {
  try {
    const { from, to, status } = req.body || {};
    const result = await mercadoLivreSyncService.syncByDateRange(from, to, status || 'paid');
    return res.json({ ok: true, ...result, from, to, status: status || 'paid' });
  } catch (e: any) {
    logger.error('ML sync run error', e);
    return res.status(500).json({ ok: false, error: e.message || 'Sync failed' });
  }
});

// POST /api/ml/sync/last-days
// Body: { days?: number, status?: string }
router.post('/last-days', optionalApiKey, async (req, res) => {
  try {
    const days = Number(req.body?.days ?? 30);
    const status = (req.body?.status as string) || 'paid';
    const result = await mercadoLivreSyncService.syncLastDays(days, status);
    return res.json({ ok: true, ...result, days, status });
  } catch (e: any) {
    logger.error('ML sync last-days error', e);
    return res.status(500).json({ ok: false, error: e.message || 'Sync failed' });
  }
});

// POST /api/ml/sync/inventory
// Synchronize Mercado Livre inventory data
router.post('/inventory', optionalApiKey, async (_req, res) => {
  try {
    logger.info('🔄 Starting ML inventory sync via API endpoint...');
    const result = await mercadoLivreInventorySyncService.syncInventory();
    logger.info(`✅ ML inventory sync completed: ${result.synced}/${result.total} items`);
    return res.json({ 
      ok: true, 
      message: 'ML inventory sync completed successfully',
      total: result.total,
      synced: result.synced 
    });
  } catch (e: any) {
    logger.error('ML inventory sync error', e);
    return res.status(500).json({ 
      ok: false, 
      error: e.message || 'Inventory sync failed' 
    });
  }
});

// POST /api/ml/sync/debug-product
// Debug specific product stock from Mercado Livre
router.post('/debug-product', optionalApiKey, async (req, res) => {
  try {
    const { sku } = req.body;
    if (!sku) {
      return res.status(400).json({ ok: false, error: 'SKU é obrigatório' });
    }
    
    logger.info(`🔍 Debug: Verificando estoque do produto ${sku} no Mercado Livre...`);
    const result = await mercadoLivreInventorySyncService.debugProductStock(sku);
    
    return res.json({ 
      ok: true, 
      sku,
      result
    });
  } catch (e: any) {
    logger.error('ML debug product error', e);
    return res.status(500).json({ 
      ok: false, 
      error: e.message || 'Debug failed' 
    });
  }
});

export const mlSyncRouter = router;

