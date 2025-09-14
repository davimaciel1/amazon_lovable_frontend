/**
 * Amazon Unified Backend - Main Entry Point
 * 
 * This server consolidates all Amazon integrations:  
 * - SP-API: Orders, Products, Inventory, Finance
 * - Advertising API: Campaigns, ACOS/TACOS metrics
 * - PostgreSQL: Single production database
 * - Real-time updates via WebSocket
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';
import cron from 'node-cron';
import { spawn } from 'child_process';
import { WebSocketServer } from 'ws';
import path from 'path';
import rateLimit from 'express-rate-limit';
import axios from 'axios';

import { logger, morganStream } from './utils/logger';
import { testDatabaseConnection, closeDatabaseConnection, pool } from './config/database';
import { validateSPAPIConfig } from './config/amazon-sp-api';
import { validateAdsAPIConfig } from './config/amazon-ads-api';

// Import routes
import { dashboardRouter } from './routes/dashboard.routes';
import { salesRouter } from './routes/sales.routes';
import { ordersRouter } from './routes/orders.routes';
import { productsRouter } from './routes/products.routes';
import { systemRouter } from './routes/system.routes';
import syncRoutes from './routes/sync.routes';
import { imagesRouter } from './routes/images.routes';
import copilotKitRouter from './routes/copilotkit.routes';
import analyticsRouter from './routes/analytics.routes';
import { salesUnifiedRouter } from './routes/sales-unified.routes';
import { mlOrdersRouter } from './routes/ml.orders.routes';
import { mlAuthRouter } from './routes/ml.auth.routes';
import { mlSyncRouter } from './routes/ml.sync.routes';
import { mlCredentialsRouter } from './routes/ml.credentials.routes';
import { costsRouter } from './routes/costs.routes';

let salesSimpleRouter: any;
try {
  // Prefer compiled route if available
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  salesSimpleRouter = require('./routes/sales-simple');
} catch (e) {
  // Fallback to source route when running from dist without copied JS
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  salesSimpleRouter = require('../src/routes/sales-simple');
}
// import { campaignsRouter } from './routes/campaigns.routes';

// Import services
import { SimpleAmazonSyncService } from './services/simple-amazon-sync.service';
import { SimpleAmazonAdsService } from './services/simple-amazon-ads.service';
import { imageManager } from './services/image-manager.service';
import { imageValidator } from './services/image-validator.service';
import { AmazonPricingService } from './services/amazon-pricing.service';
import { inventorySyncService } from './services/amazon-inventory-sync.service';
import { mercadoLivreSyncService } from './services/mercadolivre-sync.service';

// Import scheduler (to be created)
// import { scheduler } from './jobs/scheduler';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
const isProduction = process.env.NODE_ENV === 'production';
const scriptSrc = isProduction ? ["'self'"] : ["'self'", "'unsafe-inline'"];
const styleSrc = isProduction ? ["'self'"] : ["'self'", "'unsafe-inline'"];

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: [
        "'self'",
        "data:",
        "https://m.media-amazon.com",
        "https://images-na.ssl-images-amazon.com",
        "https://*.media-amazon.com",
        "https://*.ssl-images-amazon.com"
      ],
      scriptSrc: scriptSrc,
      styleSrc: styleSrc,
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
// CORS configuration - must be before routes
const corsAllowed = process.env.CORS_ORIGIN || process.env.CORS_ORIGINS;
const defaultOrigins = [
  'http://localhost:8083',
  'http://localhost:8084',
  'http://localhost:8085',
  'http://localhost:8086',
  'http://localhost:8087',
  'http://localhost:8088',
  'http://localhost:5173'
];
const allowedOrigins = corsAllowed
  ? corsAllowed.split(',').map(s => s.trim()).filter(Boolean)
  : defaultOrigins;

const corsOptions = {
  origin: (origin: string | undefined, callback: any) => {
    // Allow requests with no origin (like Postman or curl)
    console.log('[CORS] Origin:', origin, 'Allowed:', allowedOrigins);
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
'X-Requested-With',
    'X-API-Key',
    // CopilotKit runtime headers (CORS preflight)
    'x-copilotkit-runtime-client-gql-version',
    'x-copilotkit-runtime-client-version',
    'x-copilotkit-sdk-name',
    'x-copilotkit-sdk-version',
    'x-copilotkit-client'
  ],
  exposedHeaders: ['Set-Cookie'],
  optionsSuccessStatus: 204
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Clerk removed; no global auth middleware. Use API key per-route.

app.use(compression());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: morganStream }));

// Basic API rate limiting (configurable via env)
const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10); // 15 minutes
const defaultMax = isProduction ? '100' : '100000';
const maxReq = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || defaultMax, 10);
const apiLimiter = rateLimit({
  windowMs,
  max: maxReq,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    try {
      const p1 = (req as any).originalUrl || '';
      const p3 = (req as any).path || '';
      const full = `${p1}`;
      const rel = `${p3}`;
      // Bypass for OAuth and health/status endpoints regardless of mount path
      if (full.startsWith('/api/ml/auth') || rel.startsWith('/ml/auth')) return true;
      if (full.startsWith('/api/status') || full.startsWith('/api/health') || rel.startsWith('/status') || rel.startsWith('/health')) return true;
      if (full.startsWith('/api/system/db/apply-ml-schema') || rel.startsWith('/system/db/apply-ml-schema')) return true;
      if (full.startsWith('/api/ml/credentials') || rel.startsWith('/ml/credentials')) return true;
      if (full.startsWith('/api/ml/auth/exchange') || rel.startsWith('/ml/auth/exchange')) return true;
      return false;
    } catch {
      return false;
    }
  }
});
app.use('/api', apiLimiter);

// Serve static files (product images)
const publicPath = path.join(__dirname, '..', 'public');
app.use('/product-images', express.static(path.join(publicPath, 'product-images'), {
  maxAge: '7d', // Cache images for 7 days
  etag: true,
  lastModified: true,
  setHeaders: (res, filepath) => {
    // Set proper content type for images
    if (filepath.endsWith('.jpg') || filepath.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (filepath.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    }
  }
}));

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'amazon-unified-backend',
    version: '1.0.0'
  });
});

// API status endpoint
app.get('/api/status', async (_req, res) => {
  const status = {
    database: await testDatabaseConnection(),
    spApi: validateSPAPIConfig(),
    adsApi: validateAdsAPIConfig(),
    timestamp: new Date().toISOString()
  };
  
  const isHealthy = status.database && status.spApi && status.adsApi;
  
  res.status(isHealthy ? 200 : 503).json({
    healthy: isHealthy,
    services: status,
    message: isHealthy ? 'All services operational' : 'Some services are not operational'
  });
});

// Routes (protected by Clerk when needed)
app.use('/api/dashboard', dashboardRouter);
app.use('/api/sales-simple', salesSimpleRouter);  // New simple sales route with images
app.use('/api/sales', salesRouter);
app.use('/api/sales-unified', salesUnifiedRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/ml/orders', mlOrdersRouter);
app.use('/api/ml/auth', mlAuthRouter);
app.use('/api/ml/credentials', mlCredentialsRouter);
app.use('/api/ml/sync', mlSyncRouter);
app.use('/api/costs', costsRouter);
app.use('/api/products', productsRouter);
app.use('/api/system', systemRouter);
app.use('/api/sync', syncRoutes);
app.use('/api/copilotkit', copilotKitRouter);  // CopilotKit endpoint
app.use('/app', imagesRouter);  // Image proxy endpoint
app.use('/', imagesRouter);  // Image proxy endpoint (direct access)
app.use('/api/analytics', analyticsRouter);     // Analytics endpoints for tables
// app.use('/api/campaigns', campaignsRouter);

// Scheduled jobs for data integrity and freshness
try {
  const disableSchedules = process.env.DISABLE_SCHEDULES === 'true';
  if (!disableSchedules) {
    const runImageOnStart = process.env.IMAGE_SYNC_RUN_ON_START !== 'false';
    if (runImageOnStart) {
      imageValidator.validateAndFixAll().catch(err => logger.warn('Image validator on start failed', err));
    }
    // Nightly image validation (02:30)
    cron.schedule(process.env.IMAGE_SYNC_CRON || '30 2 * * *', async () => {
      try {
        logger.info('[CRON] Running image validation job');
        await imageValidator.validateAndFixAll();
      } catch (e) {
        logger.error('[CRON] Image validation job failed', e);
      }
    });

    // Nightly inventory sync (03:00)
    cron.schedule(process.env.INVENTORY_SYNC_CRON || '0 3 * * *', async () => {
      try {
        logger.info('[CRON] Running inventory sync job');
        await inventorySyncService.syncInventory();
      } catch (e) {
        logger.error('[CRON] Inventory sync job failed', e);
      }
    });

    // Price integrity repair (03:30)
    cron.schedule(process.env.PRICE_REPAIR_CRON || '30 3 * * *', async () => {
      try {
        const { repairRecentPrices } = await import('./services/data-integrity.service');
        const days = Number(process.env.PRICE_REPAIR_WINDOW_DAYS || '30');
        logger.info(`[CRON] Repairing recent prices for last ${days} days`);
        await repairRecentPrices(days);
      } catch (e) {
        logger.error('[CRON] Price repair job failed', e);
      }
    });

    // Mercado Livre orders sync every 15 minutes (configurable)
    try {
      const mlCron = process.env.ML_SYNC_CRON || '*/15 * * * *';
      const mlDays = Number(process.env.ML_SYNC_DAYS || '3');
      cron.schedule(mlCron, async () => {
        try {
          // Determine which statuses to sync (comma-separated)
          const mlStatusesStr = process.env.ML_SYNC_STATUSES || ((process.env.ML_SYNC_CANCELLED || 'true').toLowerCase() !== 'false' ? 'paid,confirmed,cancelled' : 'paid,confirmed');
          const statuses = mlStatusesStr.split(',').map(s => s.trim()).filter(Boolean);

          for (const st of statuses) {
            logger.info(`[CRON] Running Mercado Livre sync (last ${mlDays} days, status=${st})`);
            await mercadoLivreSyncService.syncLastDays(mlDays, st);
          }
        } catch (e) {
          logger.error('[CRON] ML sync job failed', e);
        }
      });
      logger.info('[CRON] ML sync schedule initialized (*/15min by default)');
    } catch (e) {
      logger.warn('Failed to initialize ML sync schedule', e);
    }

    // Nightly ML backfill (defaults: 02:05, 365 days)
    try {
      const backfillCron = process.env.ML_BACKFILL_CRON || '5 2 * * *';
      const backfillDays = Number(process.env.ML_BACKFILL_DAYS || process.env.ML_SYNC_DAYS || '365');
      const statusesStr = process.env.ML_BACKFILL_STATUSES || process.env.ML_SYNC_STATUSES || 'paid,cancelled';
      cron.schedule(backfillCron, async () => {
        try {
          const statuses = statusesStr.split(',').map(s => s.trim()).filter(Boolean);
          for (const st of statuses) {
            logger.info(`[CRON] Running ML nightly backfill (last ${backfillDays} days, status=${st})`);
            await mercadoLivreSyncService.syncLastDays(backfillDays, st);
          }
        } catch (e) {
          logger.error('[CRON] ML nightly backfill job failed', e);
        }
      });
      logger.info('[CRON] ML nightly backfill schedule initialized');
    } catch (e) {
      logger.warn('Failed to initialize ML nightly backfill schedule', e);
    }

    // ML Inventory sync every 30 minutes (configurable)
    try {
      const mlInventoryCron = process.env.ML_INVENTORY_SYNC_CRON || '*/30 * * * *';
      cron.schedule(mlInventoryCron, async () => {
        try {
          logger.info('[CRON] Running ML inventory sync...');
          const { mercadoLivreInventorySyncService } = await import('./services/mercadolivre-inventory-sync.service');
          const result = await mercadoLivreInventorySyncService.syncInventory();
          logger.info(`[CRON] ML inventory sync completed: ${result.synced}/${result.total} items`);
        } catch (e) {
          logger.error('[CRON] ML inventory sync job failed', e);
        }
      });
      logger.info(`[CRON] ML inventory sync schedule initialized (${mlInventoryCron})`);
    } catch (e) {
      logger.warn('Failed to initialize ML inventory sync schedule', e);
    }
  } else {
    logger.info('[CRON] Schedules disabled by DISABLE_SCHEDULES=true');
  }
} catch (e) {
  logger.warn('Failed to initialize scheduled jobs', e);
}

// WebSocket connection handling
wss.on('connection', async (ws, req) => {
  logger.info('New WebSocket client connected');
  try {
    // Default to requiring auth unless explicitly disabled
    const enableWsAuth = process.env.ENABLE_WS_AUTH !== 'false';
    if (enableWsAuth) {
      const authHeader = req.headers['authorization'] as string | undefined;
      const apiKeyHeader = (req.headers['x-api-key'] as string | undefined) || undefined;
      let apiKey: string | undefined;
      let token: string | undefined;

      // Prefer API key if provided
      if (apiKeyHeader && apiKeyHeader.trim()) {
        apiKey = apiKeyHeader.trim();
      } else if (authHeader && /^ApiKey\s+/i.test(authHeader)) {
        apiKey = authHeader.replace(/^ApiKey\s+/i, '').trim();
      }

      // Also accept via query string for dev convenience
      if (!apiKey && req.url && req.url.includes('api_key=')) {
        const url = new URL(req.url, `http://localhost`);
        const q = url.searchParams.get('api_key');
        if (q) apiKey = q;
      }

      // Fallback to Bearer token (JWT) if no API key
      if (!apiKey && authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
        token = authHeader.substring(7);
      } else if (!apiKey && req.url && req.url.includes('token=')) {
        const url = new URL(req.url, `http://localhost`);
        token = url.searchParams.get('token') || undefined;
      }

      const port = process.env.PORT || 8080;
      try {
        const headers: Record<string, string> = {};
        if (apiKey) headers['X-API-Key'] = apiKey;
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const resp = await axios.get(`http://127.0.0.1:${port}/api/system/auth/verify`, {
          headers,
          timeout: 5000,
        });
        if (!resp.data?.ok) {
          ws.close(1008, 'Unauthorized');
          return;
        }
        (ws as any).userId = resp.data.userId;
      } catch (e) {
        logger.warn('WS verification failed');
        ws.close(1008, 'Unauthorized');
        return;
      }
    }
  } catch (e) {
    logger.error('WS pre-auth error:', e);
  }
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      logger.debug('WebSocket message received:', data);
      
      // Handle different message types
      switch (data.type) {
        case 'subscribe':
          // Subscribe to specific data streams
          ws.send(JSON.stringify({ type: 'subscribed', channel: data.channel }));
          break;
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
        default:
          ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
      }
    } catch (error) {
      logger.error('WebSocket message error:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });
  
  ws.on('close', () => {
    logger.info('WebSocket client disconnected');
  });
  
  ws.on('error', (error) => {
    logger.error('WebSocket error:', error);
  });
  
  // Send initial connection message
  ws.send(JSON.stringify({
    type: 'connected',
    timestamp: new Date().toISOString(),
    message: 'Connected to Amazon Unified Backend WebSocket'
  }));
});

// Error handling middleware
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';
  
  res.status(status).json({
    error: {
      message,
      status,
      timestamp: new Date().toISOString()
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: 'Endpoint not found',
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString()
    }
  });
});

// ===============
// Scheduled Jobs
// ===============

// Catalog backfill (SP-API catalog/v2022) with rate limiting
let AmazonCatalogService: any;
try {
  // Use CommonJS require for JS service
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  AmazonCatalogService = require('./services/amazon-catalog.service');
} catch {
  AmazonCatalogService = null;
}

async function runCatalogBackfillCycle() {
  if (process.env.DISABLE_CATALOG_BACKFILL === 'true') {
    logger.info('Catalog backfill is disabled by env (DISABLE_CATALOG_BACKFILL=true)');
    return;
  }
  if (!AmazonCatalogService) {
    logger.warn('Catalog service not available; skipping backfill');
    return;
  }
  try {
    const limit = Number(process.env.CATALOG_BACKFILL_LIMIT || '2000');
    const svc = new AmazonCatalogService();
    logger.info(`Starting catalog backfill (limit=${limit})`);
    const res = await svc.updateAllMissingImages(limit);
    logger.info(`Catalog backfill completed: processed=${res.totalProcessed}`);
  } catch (e) {
    logger.error('Catalog backfill cycle failed:', e);
  }
}

function runImageRefreshScript(args: string[]): Promise<number> {
  return new Promise((resolve) => {
    try {
      const rootDir = path.resolve(__dirname, '..', '..'); // repo root
      const scriptPath = path.join(rootDir, 'scripts', 'sync', 'refresh-products-images.js');
      const node = process.execPath; // current Node binary
      const child = spawn(node, [scriptPath, ...args], {
        cwd: rootDir,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      child.stdout.on('data', (data) => logger.info(`[image-refresh] ${data.toString().trim()}`));
      child.stderr.on('data', (data) => logger.warn(`[image-refresh] ${data.toString().trim()}`));
      child.on('close', (code) => {
        logger.info(`[image-refresh] exited with code ${code}`);
        resolve(code ?? 0);
      });
    } catch (error) {
      logger.error('Failed to launch image refresh script', error);
      resolve(1);
    }
  });
}

async function runFullImageSyncCycle() {
  if (process.env.DISABLE_IMAGE_SYNC === 'true') {
    logger.info('Image sync is disabled by env (DISABLE_IMAGE_SYNC=true)');
    return;
  }

  logger.info('Starting full image sync cycle...');
  // Step 1: Refresh image URLs from SP-API for all ASINs
  const refreshArgs = ['--all', '--include-order-items', '--limit', process.env.IMAGE_SYNC_BATCH_SIZE || '500'];
  const code = await runImageRefreshScript(refreshArgs);
  if (code !== 0) {
    logger.warn('Image refresh script reported a non-zero exit code');
  }

  // Step 2: Download and persist local images (updates products.local_image_url)
  try {
    await imageManager.processAllProductImages();
    logger.info('Local image processing complete');
  } catch (err) {
    logger.error('Error during local image processing:', err);
  }
}

// Schedule daily at 02:30 AM server time
try {
  const cronExpr = process.env.IMAGE_SYNC_CRON || '30 2 * * *';
  cron.schedule(cronExpr, () => {
    runFullImageSyncCycle().catch((e) => logger.error('Image sync cycle failed:', e));
  });
  logger.info(`Image sync job scheduled with cron: ${process.env.IMAGE_SYNC_CRON || '30 2 * * *'}`);
  
  // Optional: run once at startup (can be disabled)
  if (process.env.IMAGE_SYNC_RUN_ON_START !== 'false') {
    runFullImageSyncCycle().catch((e) => logger.error('Initial image sync cycle failed:', e));
  }
} catch (e) {
  logger.error('Failed to schedule image sync job:', e);
}

// Schedule automatic image validation every hour
try {
  const imageValidationCron = process.env.IMAGE_VALIDATION_CRON || '0 * * * *'; // Every hour
  cron.schedule(imageValidationCron, async () => {
    logger.info('Running automatic image validation...');
    const result = await imageValidator.validateAndFixAll();
    if (result.stillProblematic > 0) {
      logger.warn(`Image validation found ${result.stillProblematic} problematic images that couldn't be fixed`);
    } else {
      logger.info('All product images are valid');
    }
  });
logger.info(`Image validation job scheduled with cron: ${imageValidationCron}`);

  // Schedule inventory sync (defaults hourly)
  try {
    const inventoryCron = process.env.INVENTORY_SYNC_CRON || '0 * * * *'; // top of every hour
    cron.schedule(inventoryCron, async () => {
      try {
        logger.info('Running scheduled inventory sync...');
        await inventorySyncService.syncInventory();
        logger.info('Inventory sync completed');
      } catch (e) {
        logger.error('Inventory sync failed:', e);
      }
    });
    logger.info(`Inventory sync scheduled with cron: ${inventoryCron}`);

    // Optional: run at startup if enabled
    if (process.env.INVENTORY_SYNC_RUN_ON_START === 'true') {
      setTimeout(() => {
        inventorySyncService.syncInventory().catch((e) => logger.error('Startup inventory sync failed:', e));
      }, 10_000);
    }
  } catch (e) {
    logger.error('Failed to schedule inventory sync:', e);
  }

  // Schedule catalog backfill nightly (default 03:00) with conservative throughput
  const catalogCron = process.env.CATALOG_BACKFILL_CRON || '0 3 * * *';
  cron.schedule(catalogCron, () => {
    runCatalogBackfillCycle().catch((e) => logger.error('Catalog backfill failed:', e));
  });
  logger.info(`Catalog backfill job scheduled with cron: ${catalogCron}`);

  // Schedule pricing offers sync (daily by default)
  try {
    const pricingCron = process.env.PRICING_SYNC_CRON || '15 3 * * *'; // 03:15 daily
    const pricing = new AmazonPricingService();
    if (pricing.isEnabled() && process.env.ENABLE_PRICING_SYNC !== 'false') {
      cron.schedule(pricingCron, async () => {
        try {
          logger.info('Running scheduled pricing offers sync...');
          const res = await pricing.updateAllKnownAsins(Number(process.env.PRICING_SYNC_LIMIT || '200'));
          logger.info(`Pricing sync completed: updated=${res.updated}/${res.total}, errors=${res.errors}`);
        } catch (e) {
          logger.error('Pricing sync failed:', e);
        }
      });
      logger.info(`Pricing offers sync scheduled with cron: ${pricingCron}`);

      // Optional run on startup
      if (process.env.PRICING_SYNC_RUN_ON_START === 'true') {
        setTimeout(async () => {
          const res = await pricing.updateAllKnownAsins(Number(process.env.PRICING_SYNC_LIMIT || '100'));
          logger.info(`Startup pricing sync: updated=${res.updated}/${res.total}, errors=${res.errors}`);
        }, 20_000);
      }
    } else {
      logger.warn('Pricing offers sync disabled or credentials missing; skipping schedule');
    }
  } catch (e) {
    logger.error('Failed to schedule pricing offers sync:', e);
  }
  
  // Run validation on startup to fix any placeholders immediately
  setTimeout(async () => {
    logger.info('Running startup image validation...');
    const result = await imageValidator.validateAndFixAll();
    if (result.success) {
      logger.info(`Startup validation: ${result.checked} checked, ${result.valid} valid, ${result.fixed} fixed, ${result.stillProblematic} still problematic`);
    }
  }, 5000); // Wait 5 seconds after startup
} catch (e) {
  logger.error('Failed to schedule image validation job:', e);
}

// Graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function shutdown() {
  logger.info('Shutdown signal received, closing gracefully...');
  
  // Close WebSocket connections
  wss.clients.forEach((client) => {
    client.close();
  });
  
  // Stop sync services
  if ((global as any).amazonSyncService) {
    await (global as any).amazonSyncService.stop();
    logger.info('Amazon sync service stopped');
  }
  
  if ((global as any).amazonAdsSyncService) {
    await (global as any).amazonAdsSyncService.stop();
    logger.info('Amazon Ads sync service stopped');
  }
  
  // Close database connections
  await closeDatabaseConnection();
  
  // Close HTTP server
  server.close(() => {
    logger.info('Server closed successfully');
    process.exit(0);
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

// Start server
async function startServer() {
  try {
    logger.info('🚀 Starting Amazon Unified Backend...');
    logger.info('='.repeat(50));
    
    // Validate configurations
    logger.info('Validating configurations...');
    const dbConnected = await testDatabaseConnection();
    // Ensure cost columns exist for products (so sales-simple can compute profit/ROI)
    if (dbConnected) {
      try {
        await pool.query(`
          ALTER TABLE products
            ADD COLUMN IF NOT EXISTS custos_manuais boolean,
            ADD COLUMN IF NOT EXISTS compra numeric,
            ADD COLUMN IF NOT EXISTS armazenagem numeric,
            ADD COLUMN IF NOT EXISTS frete_amazon numeric,
            ADD COLUMN IF NOT EXISTS custos_percentuais numeric,
            ADD COLUMN IF NOT EXISTS imposto_percent numeric,
            ADD COLUMN IF NOT EXISTS custo_variavel_percent numeric,
            ADD COLUMN IF NOT EXISTS margem_contribuicao_percent numeric;
        `);
        logger.info('Ensured products cost columns exist');
      } catch (mErr) {
        logger.warn('Could not ensure products cost columns:', mErr);
      }

      // Ensure unified omnichannel sales view exists
      try {
        await pool.query(`
          CREATE OR REPLACE VIEW unified_sales_lines AS
          SELECT 
            'amazon'::text AS channel,
            o.amazon_order_id::text AS order_id,
            oi.asin::text AS product_key,
            COALESCE(p.sku, oi.seller_sku, oi.asin)::text AS sku,
            COALESCE(p.title, oi.title, oi.asin)::text AS title,
            oi.quantity_ordered::numeric AS units,
            (COALESCE(oi.price_amount, oi.item_price::numeric) * oi.quantity_ordered::numeric) AS revenue,
            o.purchase_date AS purchase_date
          FROM orders o
          LEFT JOIN order_items oi ON o.amazon_order_id = oi.amazon_order_id
          LEFT JOIN products p ON p.asin = oi.asin
          WHERE oi.asin IS NOT NULL
          UNION ALL
          SELECT 
            'ml'::text AS channel,
            o.ml_order_id::text AS order_id,
            COALESCE(oi.seller_sku, oi.item_id)::text AS product_key,
            COALESCE(oi.seller_sku, oi.item_id)::text AS sku,
            COALESCE(oi.title, COALESCE(oi.seller_sku, oi.item_id)::text)::text AS title,
            COALESCE(oi.quantity,0)::numeric AS units,
            (COALESCE(oi.quantity,0)::numeric * COALESCE(oi.unit_price, oi.full_unit_price, 0)::numeric) AS revenue,
            o.date_created AS purchase_date
          FROM ml_orders o
          LEFT JOIN ml_order_items oi ON o.ml_order_id = oi.ml_order_id;
        `);
        logger.info('Ensured unified_sales_lines view exists (omnichannel)');
      } catch (vErr) {
        logger.warn('Could not create unified_sales_lines view:', vErr);
      }
    }

    const spApiValid = validateSPAPIConfig();
    const adsApiValid = validateAdsAPIConfig();
    
    if (!dbConnected) {
      logger.warn('⚠️ Database connection failed - running in limited mode');
      // Continue without database for testing
    }
    
    if (!spApiValid || !adsApiValid) {
      logger.warn('⚠️ Some API configurations are invalid, but starting server anyway');
    }
    
    // Initialize sync services with AUTO-SYNC
    if (spApiValid && process.env.ENABLE_AUTO_SYNC === 'true') {
      logger.info('🚀 Starting Amazon AUTO-SYNC service...');
      const amazonSyncService = new SimpleAmazonSyncService();
      await amazonSyncService.initialize();
      logger.info('✅ Amazon SP-API AUTO-SYNC service initialized');
      logger.info('📊 Products will sync automatically on startup and every 30 minutes');
      
      // Store service instance for graceful shutdown
      (global as any).amazonSyncService = amazonSyncService;
    }
    
    if (adsApiValid && process.env.ENABLE_ADS_SYNC === 'true') {
      const amazonAdsSyncService = new SimpleAmazonAdsService();
      await amazonAdsSyncService.initialize();
      logger.info('✅ Amazon Ads API sync service initialized');
      
      // Store service instance for graceful shutdown
      (global as any).amazonAdsSyncService = amazonAdsSyncService;
    }
    
    const PORT = process.env.PORT || 8080;
    // const WS_PORT = process.env.WS_PORT || 3001;
    
    server.listen(PORT, () => {
      logger.info('='.repeat(50));
      logger.info(`✅ Server running on port ${PORT}`);
      logger.info( `? WebSocket server attached (same port ${PORT})`); 
      logger.info(`📊 Dashboard: http://localhost:${PORT}`);
      logger.info(`🔄 Health check: http://localhost:${PORT}/health`);
      logger.info(`📈 API status: http://localhost:${PORT}/api/status`);
      logger.info('='.repeat(50));
      logger.info('⚠️  CRITICAL: Amazon API integrations are ACTIVE');
      logger.info('⚠️  DO NOT modify credentials or database config');
    });
    
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();
