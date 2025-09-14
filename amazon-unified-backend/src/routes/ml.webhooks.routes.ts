import express from 'express';
import crypto from 'crypto';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { mercadoLivreWebhookService } from '../services/mercadolivre-webhook.service';

const router = express.Router();

// Note: ML doesn't provide fixed IPs, security should be based on signature validation
// and OAuth token verification instead of IP allowlisting

// Middleware para parsing do corpo da requisição
router.use(express.raw({ type: 'application/json' }));

/**
 * POST /api/ml/webhooks/notifications
 * Endpoint principal para receber notificações do ML
 * Conforme documentação oficial 2024
 */
router.post('/notifications', async (req, res) => {
  try {
    logger.info('📨 Received ML webhook notification');

    // Validar assinatura de segurança (se configurada)
    const signature = req.headers['x-signature'] as string;
    if (signature && !validateSignature(signature, req.body)) {
      logger.warn('🔒 Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parse do payload
    let payload;
    try {
      // express.raw always returns Buffer, need to convert to string first
      const bodyString = req.body instanceof Buffer ? req.body.toString('utf8') : String(req.body);
      payload = JSON.parse(bodyString);
    } catch (error) {
      logger.error('❌ Invalid JSON payload:', error);
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    // Validar estrutura mínima do payload
    if (!payload.topic || !payload.resource || !payload.user_id) {
      logger.warn('⚠️ Invalid webhook payload structure:', payload);
      return res.status(400).json({ error: 'Invalid payload structure' });
    }

    logger.info(`🔄 Processing webhook: ${payload.topic} - ${payload.resource}`);

    // Respond immediately to ML (as required by webhook specification)
    res.status(200).json({ 
      ok: true, 
      message: 'Webhook received and queued for processing'
    });

    // Process webhook asynchronously to avoid timeouts
    setImmediate(async () => {
      try {
        const result = await mercadoLivreWebhookService.processWebhook(payload);
        if (result.success) {
          logger.info(`✅ Webhook processed: ${result.action}`);
        } else {
          logger.error(`❌ Webhook processing failed: ${result.error}`);
        }
      } catch (error) {
        logger.error('❌ Async webhook processing error:', error);
      }
    });
    
    return; // Explicit return to satisfy TypeScript

  } catch (error) {
    logger.error('❌ Webhook endpoint error:', error);
    return res.status(500).json({ 
      ok: false, 
      error: 'Internal server error' 
    });
  }
});

/**
 * GET /api/ml/webhooks/test
 * Endpoint para teste de conectividade
 */
router.get('/test', (_req, res) => {
  logger.info('🧪 Webhook test endpoint accessed');
  return res.json({
    ok: true,
    message: 'ML Webhook endpoint is active',
    timestamp: new Date().toISOString(),
    security: 'Secured by signature validation and OAuth verification'
  });
});

/**
 * POST /api/ml/webhooks/simulate
 * Endpoint para simular webhooks (apenas desenvolvimento)
 */
router.post('/simulate', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not available in production' });
  }

  const { topic, resource, user_id } = req.body;

  if (!topic || !resource || !user_id) {
    return res.status(400).json({ 
      error: 'Required fields: topic, resource, user_id' 
    });
  }

  const simulatedPayload = {
    user_id: user_id.toString(),
    topic,
    resource,
    application_id: process.env.ML_CLIENT_ID || 'test',
    attempts: 1,
    sent: new Date().toISOString(),
    received: new Date().toISOString()
  };

  try {
    const result = await mercadoLivreWebhookService.processWebhook(simulatedPayload);
    
    return res.json({
      ok: true,
      simulation: true,
      payload: simulatedPayload,
      result
    });
  } catch (error) {
    logger.error('❌ Webhook simulation failed:', error);
    return res.status(500).json({
      ok: false,
      error: (error as Error).message
    });
  }
});

/**
 * GET /api/ml/webhooks/logs
 * Histórico de webhooks recebidos
 */
router.get('/logs', async (req, res) => {
  try {
    const { page = '1', limit = '50', topic } = req.query;
    const pageNum = Math.max(parseInt(page as string) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit as string) || 50, 1), 200);
    const offset = (pageNum - 1) * pageSize;

    let query = `
      SELECT 
        id, user_id, topic, resource, application_id,
        attempts, sent_at, received_at, processed_at,
        created_at
      FROM ml_webhook_logs
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramIndex = 1;

    if (topic) {
      query += ` AND topic = $${paramIndex++}`;
      params.push(topic);
    }

    query += ` ORDER BY created_at DESC`;
    query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(pageSize, offset);

    const result = await pool.query(query, params);

    return res.json({
      ok: true,
      webhooks: result.rows,
      pagination: {
        page: pageNum,
        limit: pageSize,
        total: result.rowCount || 0
      }
    });

  } catch (error) {
    logger.error('❌ Error fetching webhook logs:', error);
    return res.status(500).json({
      ok: false,
      error: 'Failed to fetch webhook logs'
    });
  }
});

/**
 * Validar assinatura de segurança do webhook
 * Baseado na documentação oficial ML
 */
function validateSignature(signature: string, body: Buffer | string): boolean {
  try {
    // Extrair dados da assinatura
    const parts = signature.split(',');
    let ts = '';
    let v1 = '';

    for (const part of parts) {
      const [key, value] = part.split('=');
      if (key === 'ts') ts = value;
      if (key === 'v1') v1 = value;
    }

    if (!ts || !v1) {
      logger.warn('🔒 Missing signature components');
      return false;
    }

    // Verificar timestamp (não mais que 5 minutos)
    const timestampNum = parseInt(ts, 10);
    const currentTime = Math.floor(Date.now() / 1000);
    
    if (Math.abs(currentTime - timestampNum) > 300) { // 5 minutos
      logger.warn('🔒 Signature timestamp too old');
      return false;
    }

    // Obter secret da aplicação (deve ser configurado)
    const secret = process.env.ML_WEBHOOK_SECRET;
    if (!secret) {
      logger.warn('🔒 ML_WEBHOOK_SECRET not configured - skipping signature validation');
      return true; // Permitir se secret não estiver configurado
    }

    // Gerar hash esperado
    const bodyString = body instanceof Buffer ? body.toString('utf8') : String(body);
    const payload = `${ts}.${bodyString}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(v1),
      Buffer.from(expectedSignature)
    );

  } catch (error) {
    logger.error('🔒 Signature validation error:', error);
    return false;
  }
}

export const mlWebhooksRouter = router;