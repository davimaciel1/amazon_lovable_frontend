/**
 * Sync Management Routes
 * API endpoints for controlling the complete synchronization process
 */

import { Router, Request, Response } from 'express';
import { CompleteSyncService } from '../services/complete-sync.service';
import { requireApiKey } from '../middleware/apiKey.middleware';
import { inventorySyncService } from '../services/amazon-inventory-sync.service';
import { AmazonPricingService } from '../services/amazon-pricing.service';

const router = Router();
const syncService = new CompleteSyncService();

/**
 * Start or resume synchronization
 * POST /api/sync/start
 */
router.post('/start', requireApiKey, async (_req: Request, res: Response) => {
  try {
    // Start sync in background
    syncService.startSync().catch(error => {
      console.error('Sync error:', error);
    });

    res.json({
      success: true,
      message: 'Synchronization started',
      status: syncService.getSyncStatus()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to start synchronization'
    });
  }
});

/**
 * Pause synchronization
 * POST /api/sync/pause
 */
router.post('/pause', requireApiKey, async (_req: Request, res: Response) => {
  try {
    await syncService.pauseSync();
    
    res.json({
      success: true,
      message: 'Synchronization paused',
      status: syncService.getSyncStatus()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to pause synchronization'
    });
  }
});

/**
 * Get synchronization status
 * GET /api/sync/status
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = syncService.getSyncStatus();
    
    res.json({
      success: true,
      status,
      progress: status.totalAsins > 0 
        ? ((status.processedAsins / status.totalAsins) * 100).toFixed(2) + '%'
        : '0%'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get sync status'
    });
  }
});

/**
 * Reset synchronization progress
 * POST /api/sync/reset
 */
router.post('/reset', requireApiKey, async (_req: Request, res: Response) => {
  try {
    await syncService.resetProgress();
    
    res.json({
      success: true,
      message: 'Synchronization progress reset'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to reset progress'
    });
  }
});

/**
 * Manual trigger: inventory sync (FBA Listings/Inventory)
 * GET /api/sync/inventory
 */
router.get('/inventory', requireApiKey, async (_req: Request, res: Response) => {
  try {
    setImmediate(() => {
      inventorySyncService.syncInventory().catch((e) => console.error('Inventory sync failed:', e));
    });
    res.json({ ok: true, message: 'Inventory sync started' });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Failed to start inventory sync' });
  }
});

/**
 * Manual trigger: pricing offers sync (Buy Box, sellers)
 * GET /api/sync/pricing
 */
router.get('/pricing', requireApiKey, async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit || process.env.PRICING_SYNC_LIMIT || 100);
    const svc = new AmazonPricingService();
    if (!svc.isEnabled()) {
      res.status(400).json({ ok: false, error: 'Pricing sync disabled or credentials missing' });
      return;
    }
    setImmediate(() => {
      svc.updateAllKnownAsins(limit).catch((e) => console.error('Pricing sync failed:', e));
    });
    res.json({ ok: true, message: `Pricing sync started (limit=${limit})` });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Failed to start pricing sync' });
  }
});

export default router;
