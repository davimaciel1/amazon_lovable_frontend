import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import jwt from 'jsonwebtoken';

function getAllowedKeys(): Set<string> {
  const keys: string[] = [];
  if (process.env.API_KEYS) {
    keys.push(
      ...process.env.API_KEYS
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    );
  }
  if (process.env.API_KEY) {
    keys.push(process.env.API_KEY.trim());
  }
  return new Set(keys.filter(Boolean));
}

function extractApiKey(req: Request): string | null {
  // 1) X-API-Key header
  const headerKey = req.header('x-api-key') || req.header('X-API-Key');
  if (headerKey && typeof headerKey === 'string') return headerKey.trim();

  // 2) Authorization: ApiKey <key>
  const auth = req.header('authorization');
  if (auth && /^ApiKey\s+/i.test(auth)) {
    return auth.replace(/^ApiKey\s+/i, '').trim();
  }

  // 3) Optional: query param for local/dev convenience
  if (process.env.ALLOW_API_KEY_IN_QUERY === 'true') {
    const q = (req.query?.api_key || req.query?.apikey || req.query?.key) as string | undefined;
    if (q) return String(q).trim();
  }

  return null;
}

function isKeyValid(key: string): boolean {
  const set = getAllowedKeys();
  return set.size > 0 && set.has(key);
}

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const provided = extractApiKey(req);
  const configured = getAllowedKeys();

  if (configured.size === 0) {
    // No keys configured – fail closed to avoid accidental exposure
    logger.warn('API key required but no API_KEY/API_KEYS configured');
    res.status(500).json({ error: 'API key not configured on server' });
    return;
  }

  if (!provided || !isKeyValid(provided)) {
    res.status(401).json({ error: 'Invalid or missing API key' });
    return;
  }

  (req as any).apiKey = provided;
  next();
}

export function optionalApiKey(req: Request, _res: Response, next: NextFunction): void {
  const provided = extractApiKey(req);
  if (provided && isKeyValid(provided)) {
    (req as any).apiKey = provided;
    (req as any).apiKeyValid = true;
  } else {
    (req as any).apiKeyValid = false;
  }
  next();
}

// Accept either a valid API key (X-API-Key or Authorization: ApiKey <key>)
// OR a valid Bearer token (JWT) in Authorization header
export function requireAuthOrApiKey(req: Request, res: Response, next: NextFunction): void {
  const provided = extractApiKey(req);

  // If API key configured and provided matches
  if (provided && isKeyValid(provided)) {
    (req as any).apiKey = provided;
    return next();
  }

  // Else try Bearer JWT if present
  const auth = req.header('authorization') || '';
  const bearerMatch = auth.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    const token = bearerMatch[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret-change-in-production');
      (req as any).user = decoded;
      return next();
    } catch (e) {
      logger.warn('Bearer token verification failed');
    }
  }

  res.status(401).json({ error: 'Unauthorized: provide X-API-Key or Authorization Bearer token' });
}
