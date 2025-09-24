import express from 'express';
import { pool } from '../config/database';
import { optionalApiKey, requireApiKey } from '../middleware/apiKey.middleware';
import { logger } from '../utils/logger';

const router = express.Router();

async function upsert(key: string, value: string) {
  await pool.query(
    `INSERT INTO ml_credentials (credential_key, credential_value, is_active, updated_at)
     VALUES ($1,$2,true,NOW())
     ON CONFLICT (credential_key)
     DO UPDATE SET credential_value = EXCLUDED.credential_value, is_active = true, updated_at = NOW()`,
    [key, value]
  );
}

// Secure endpoint (requires API key)
router.post('/secure-upsert', requireApiKey, async (req, res) => {
  try {
    const { refreshToken, sellerId, clientId, clientSecret, accessToken, expiresIn } = req.body || {};
    if (!refreshToken && !sellerId && !clientId && !clientSecret && !accessToken) {
      return res.status(400).json({ error: 'Nothing to upsert' });
    }
    if (clientId) await upsert('ML_CLIENT_ID', String(clientId));
    if (clientSecret) await upsert('ML_CLIENT_SECRET', String(clientSecret));
    if (refreshToken) await upsert('ML_REFRESH_TOKEN', String(refreshToken));
    if (sellerId) await upsert('ML_SELLER_ID', String(sellerId));
    if (accessToken) await upsert('ML_ACCESS_TOKEN', String(accessToken));
    if (expiresIn) await upsert('ML_ACCESS_TOKEN_EXPIRES_IN', String(expiresIn));
    return res.json({ ok: true });
  } catch (e: any) {
    logger.error('Failed credentials secure-upsert', e);
    return res.status(500).json({ error: e.message || 'Failed to upsert credentials' });
  }
});

// Dev convenience endpoint: allowed only from localhost and non-production
router.post('/upsert', optionalApiKey, async (req, res) => {
  try {
    const isProduction = process.env.NODE_ENV === 'production';
    const ip = (req.ip || '').toString();
    const isLocal = ip.includes('127.0.0.1') || ip === '::1' || req.hostname === 'localhost';
    if (isProduction && !(req as any).apiKeyValid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!isLocal && !(req as any).apiKeyValid) {
      return res.status(401).json({ error: 'Unauthorized (not local and no API key)' });
    }

    const { refreshToken, sellerId, clientId, clientSecret, accessToken, expiresIn } = req.body || {};
    if (!refreshToken && !sellerId && !clientId && !clientSecret && !accessToken) {
      return res.status(400).json({ error: 'Nothing to upsert' });
    }
    if (clientId) await upsert('ML_CLIENT_ID', String(clientId));
    if (clientSecret) await upsert('ML_CLIENT_SECRET', String(clientSecret));
    if (refreshToken) await upsert('ML_REFRESH_TOKEN', String(refreshToken));
    if (sellerId) await upsert('ML_SELLER_ID', String(sellerId));
    if (accessToken) await upsert('ML_ACCESS_TOKEN', String(accessToken));
    if (expiresIn) await upsert('ML_ACCESS_TOKEN_EXPIRES_IN', String(expiresIn));

    return res.json({ ok: true });
  } catch (e: any) {
    logger.error('Failed credentials upsert', e);
    return res.status(500).json({ error: e.message || 'Failed to upsert credentials' });
  }
});

// Get access token for internal use (image fetching)
router.get('/access-token', optionalApiKey, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT credential_value FROM ml_credentials WHERE credential_key = 'ML_ACCESS_TOKEN' AND is_active = true`
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No ML access token found' });
    }
    
    const accessToken = result.rows[0].credential_value;
    return res.json({ access_token: accessToken });
  } catch (e: any) {
    logger.error('Failed to get ML access token', e);
    return res.status(500).json({ error: e.message || 'Failed to get access token' });
  }
});

router.get('/ping', (_req, res) => res.json({ ok: true }));

export const mlCredentialsRouter = router;

