import express from 'express';
import { mercadoLivreSyncService } from '../services/mercadolivre-sync.service';
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

export const mlSyncRouter = router;

