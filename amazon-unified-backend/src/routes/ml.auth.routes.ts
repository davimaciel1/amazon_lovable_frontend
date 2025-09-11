import { Router } from 'express';
import axios from 'axios';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { optionalApiKey, requireApiKey } from '../middleware/apiKey.middleware';

const router = Router();

function getEnv(name: string, fallback?: string) {
  const v = process.env[name] || fallback;
  if (!v) throw new Error(`${name} not configured`);
  return v;
}

async function upsertCredential(key: string, value: string) {
  await pool.query(
    `INSERT INTO ml_credentials (credential_key, credential_value, is_active, updated_at)
     VALUES ($1, $2, true, NOW())
     ON CONFLICT (credential_key)
     DO UPDATE SET credential_value = EXCLUDED.credential_value, is_active = true, updated_at = NOW()`,
    [key, value]
  );
}

function isAllowedRedirect(uri: string): boolean {
  const allowed = new Set(
    [
      process.env.ML_REDIRECT_URI,
      'https://api.appproft.com/api/v1/auth/mercadolivre/callback',
      'https://appproft.com/api/marketplace/mercadolivre/callback',
    ].filter(Boolean) as string[]
  );
  try {
    new URL(uri); // validate shape
    for (const a of allowed) {
      if (a && uri === a) return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Start OAuth: redirect to Mercado Livre auth page
router.get('/start', async (req, res) => {
  try {
    const clientId = getEnv('ML_CLIENT_ID');
    const redirectParam = (req.query.redirect as string | undefined) || process.env.ML_REDIRECT_URI || '';
    const useRedirect = isAllowedRedirect(redirectParam) ? redirectParam : getEnv('ML_REDIRECT_URI');
    const state = (req.query.state as string | undefined) || '';
    const codeChallenge = (req.query.code_challenge as string | undefined) || '';
    const codeMethod = (req.query.code_challenge_method as string | undefined) || 'S256';

    const base = 'https://auth.mercadolibre.com.br/authorization';
    const qp = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: useRedirect,
    });
    if (state) qp.set('state', state);
    if (codeChallenge) {
      qp.set('code_challenge', codeChallenge);
      qp.set('code_challenge_method', codeMethod);
    }
    const url = `${base}?${qp.toString()}`;
    res.redirect(url);
  } catch (e: any) {
    logger.error('ML OAuth start error', e);
    res.status(500).json({ error: e.message || 'OAuth start failed' });
  }
});

// OAuth callback: exchange code for tokens and persist (when redirect points here)
router.get('/callback', async (req, res) => {
  try {
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;
    const codeVerifier = req.query.code_verifier as string | undefined;
    if (!code) return res.status(400).json({ error: 'Missing code' });

    const clientId = getEnv('ML_CLIENT_ID');
    const clientSecret = getEnv('ML_CLIENT_SECRET');
    const redirectUri = getEnv('ML_REDIRECT_URI');

    const params = new URLSearchParams();
    params.set('grant_type', 'authorization_code');
    params.set('client_id', clientId);
    params.set('client_secret', clientSecret);
    params.set('code', code);
    params.set('redirect_uri', redirectUri);
    if (codeVerifier) params.set('code_verifier', codeVerifier);

    const resp = await axios.post('https://api.mercadolibre.com/oauth/token', params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    });

    const data = resp.data || {};
    const accessToken = data.access_token as string | undefined;
    const refreshToken = data.refresh_token as string | undefined;
    const userId = data.user_id?.toString();
    const expiresIn = data.expires_in?.toString();

    if (refreshToken) await upsertCredential('ML_REFRESH_TOKEN', refreshToken);
    if (accessToken) await upsertCredential('ML_ACCESS_TOKEN', accessToken);
    if (userId) await upsertCredential('ML_SELLER_ID', userId);
    if (expiresIn) await upsertCredential('ML_ACCESS_TOKEN_EXPIRES_IN', expiresIn);

    // Try to confirm profile
    if (accessToken) {
      try {
        const userResp = await axios.get('https://api.mercadolibre.com/users/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 10000,
        });
        const sellerId = (userResp.data?.id || userId)?.toString();
        if (sellerId) await upsertCredential('ML_SELLER_ID', sellerId);
      } catch (e) {
        logger.warn('Could not fetch ML seller profile');
      }
    }

    return res.json({ ok: true, state: state || null });
  } catch (e: any) {
    logger.error('ML OAuth callback error', e.response?.data || e.message);
    return res.status(500).json({ error: e.response?.data || e.message || 'OAuth callback failed' });
  }
});

// New: Exchange endpoint for external callback to delegate token exchange to this backend
router.post('/exchange', requireApiKey, async (req, res) => {
  try {
    const { code, redirect_uri, code_verifier } = req.body || {};
    if (!code || !redirect_uri) {
      return res.status(400).json({ error: 'Missing code or redirect_uri' });
    }
    if (!isAllowedRedirect(redirect_uri)) {
      return res.status(400).json({ error: 'redirect_uri not allowed' });
    }

    // Load client credentials from DB or env
    const clientIdRes = await pool.query("SELECT credential_value FROM ml_credentials WHERE credential_key = 'ML_CLIENT_ID' LIMIT 1");
    const clientSecretRes = await pool.query("SELECT credential_value FROM ml_credentials WHERE credential_key = 'ML_CLIENT_SECRET' LIMIT 1");
    const clientId = (clientIdRes.rows[0]?.credential_value as string) || process.env.ML_CLIENT_ID;
    const clientSecret = (clientSecretRes.rows[0]?.credential_value as string) || process.env.ML_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: 'ML client credentials not configured' });
    }

    const params = new URLSearchParams();
    params.set('grant_type', 'authorization_code');
    params.set('client_id', clientId);
    params.set('client_secret', clientSecret);
    params.set('code', code);
    params.set('redirect_uri', redirect_uri);
    if (code_verifier) params.set('code_verifier', code_verifier);

    const exch = await axios.post('https://api.mercadolibre.com/oauth/token', params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    });

    const d = exch.data || {};
    const accessToken = d.access_token as string | undefined;
    const refreshToken = d.refresh_token as string | undefined;
    const userId = d.user_id?.toString();
    const expiresIn = d.expires_in?.toString();

    if (clientId) await upsertCredential('ML_CLIENT_ID', clientId);
    if (clientSecret) await upsertCredential('ML_CLIENT_SECRET', clientSecret);
    if (refreshToken) await upsertCredential('ML_REFRESH_TOKEN', refreshToken!);
    if (accessToken) await upsertCredential('ML_ACCESS_TOKEN', accessToken!);
    if (userId) await upsertCredential('ML_SELLER_ID', userId!);
    if (expiresIn) await upsertCredential('ML_ACCESS_TOKEN_EXPIRES_IN', expiresIn!);

    return res.json({ ok: true, has_refresh: !!refreshToken, userId: userId || null });
  } catch (e: any) {
    logger.error('ML OAuth exchange error', e.response?.data || e.message);
    return res.status(500).json({ error: e.response?.data || e.message || 'OAuth exchange failed' });
  }
});

// Dev-only: allow local exchange without API key (localhost only)
router.post('/exchange-dev', optionalApiKey, async (req, res) => {
  try {
    const ip = (req.ip || '').toString();
    const isLocal = ip.includes('127.0.0.1') || ip === '::1' || req.hostname === 'localhost';
    if (!isLocal) return res.status(401).json({ error: 'Unauthorized (not local)' });

    const { code, redirect_uri, code_verifier } = req.body || {};
    if (!code || !redirect_uri) return res.status(400).json({ error: 'Missing code or redirect_uri' });
    if (!isAllowedRedirect(redirect_uri)) return res.status(400).json({ error: 'redirect_uri not allowed' });

    const clientId = process.env.ML_CLIENT_ID as string;
    const clientSecret = process.env.ML_CLIENT_SECRET as string;
    if (!clientId || !clientSecret) return res.status(500).json({ error: 'ML client credentials not configured' });

    const params = new URLSearchParams();
    params.set('grant_type', 'authorization_code');
    params.set('client_id', clientId);
    params.set('client_secret', clientSecret);
    params.set('code', code);
    params.set('redirect_uri', redirect_uri);
    if (code_verifier) params.set('code_verifier', code_verifier);

    const exch = await axios.post('https://api.mercadolibre.com/oauth/token', params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    });

    const d = exch.data || {};
    const accessToken = d.access_token as string | undefined;
    const refreshToken = d.refresh_token as string | undefined;
    const userId = d.user_id?.toString();

    if (refreshToken) await upsertCredential('ML_REFRESH_TOKEN', refreshToken!);
    if (accessToken) await upsertCredential('ML_ACCESS_TOKEN', accessToken!);
    if (userId) await upsertCredential('ML_SELLER_ID', userId!);

    return res.json({ ok: true });
  } catch (e: any) {
    logger.error('ML OAuth exchange-dev error', e.response?.data || e.message);
    return res.status(500).json({ error: e.response?.data || e.message || 'OAuth exchange failed' });
  }
});

export const mlAuthRouter = router;

