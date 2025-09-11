/**
 * Stubbed Clerk middleware (Clerk removed)
 * Exports no-op middlewares to keep compatibility with any legacy imports.
 */
import { Request, Response, NextFunction } from 'express';

export const clerkAuth = (_req: Request, _res: Response, next: NextFunction) => next();
export const optionalAuth = (_req: Request, _res: Response, next: NextFunction) => next();
export const isAuthenticated = (_req: Request): boolean => false;
export const getUserId = (_req: Request): string | null => null;
