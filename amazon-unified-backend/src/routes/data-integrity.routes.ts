import { Router, Request, Response } from 'express';
import { IntegrityService } from '../services/data-integrity.service';
import { logger } from '../utils/logger';

const router = Router();
const integrityService = new IntegrityService();

/**
 * POST /api/data-integrity/quick-check
 * Run a quick integrity check (last 7 days)
 */
router.post('/quick-check', async (_req: Request, res: Response) => {
  try {
    logger.info('[DataIntegrityRoutes] Starting quick integrity check');
    
    const result = await integrityService.runQuickCheck();
    
    res.json({
      success: true,
      data: result,
      message: `Quick integrity check completed. Found ${result.findingsCount} issues.`
    });
    
  } catch (error: any) {
    logger.error('[DataIntegrityRoutes] Quick check failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Quick integrity check failed'
    });
  }
});

/**
 * POST /api/data-integrity/comprehensive-check
 * Run a comprehensive integrity check (last 30 days)
 */
router.post('/comprehensive-check', async (_req: Request, res: Response) => {
  try {
    logger.info('[DataIntegrityRoutes] Starting comprehensive integrity check');
    
    const result = await integrityService.runComprehensiveCheck();
    
    res.json({
      success: true,
      data: result,
      message: `Comprehensive integrity check completed. Found ${result.findingsCount} issues.`
    });
    
  } catch (error: any) {
    logger.error('[DataIntegrityRoutes] Comprehensive check failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Comprehensive integrity check failed'
    });
  }
});

/**
 * POST /api/data-integrity/custom-check
 * Run a custom integrity check with specified parameters
 */
router.post('/custom-check', async (req: Request, res: Response) => {
  try {
    const { window = 7, maxRecords = 10000, timeout = 120000, enableSampling = false, samplingPercentage = 10 } = req.body;
    
    logger.info('[DataIntegrityRoutes] Starting custom integrity check', {
      window,
      maxRecords,
      timeout,
      enableSampling,
      samplingPercentage
    });
    
    const result = await integrityService.runChecks({
      window: parseInt(window),
      maxRecordsToCheck: parseInt(maxRecords),
      timeoutMs: parseInt(timeout),
      enableSampling: Boolean(enableSampling),
      samplingPercentage: parseFloat(samplingPercentage)
    });
    
    res.json({
      success: true,
      data: result,
      message: `Custom integrity check completed. Found ${result.findingsCount} issues.`
    });
    
  } catch (error: any) {
    logger.error('[DataIntegrityRoutes] Custom check failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Custom integrity check failed'
    });
  }
});

/**
 * GET /api/data-integrity/status
 * Get the status of the integrity service
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: {
        serviceName: 'IntegrityService',
        version: '1.0.0',
        status: 'active',
        capabilities: [
          'duplicate_inflation_detection',
          'cardinality_checks', 
          'referential_integrity_checks',
          'audit_integration',
          'advisory_locks'
        ],
        supportedWindows: [1, 7, 30, 90],
        maxTimeout: 600000 // 10 minutes
      },
      message: 'Data integrity service is operational'
    });
    
  } catch (error: any) {
    logger.error('[DataIntegrityRoutes] Status check failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to get service status'
    });
  }
});

export default router;