/**
 * Authentication Middleware
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';

// Extend Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction): void => {
  // Skip authentication in development/test mode for certain endpoints
  if (process.env.NODE_ENV === 'development' || process.env.SKIP_AUTH === 'true') {
    // Allow test requests without authentication
    req.user = { id: 'test-user', email: 'test@example.com' };
    next();
    return;
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (error) {
    logger.error('Token verification failed:', error);
    res.status(403).json({ error: 'Invalid or expired token' });
    return;
  }
};

export default authenticateToken;