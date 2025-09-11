import { logger } from './logger';

export function isConsistencyLocked(): boolean {
  const locked = process.env.CONSISTENCY_LOCK === 'true';
  return locked;
}

export function assertImageUpdateAllowed(context: string, asin: string): boolean {
  const locked = isConsistencyLocked();
  if (locked) {
    logger.warn(`CONSISTENCY_LOCK active: blocking image URL update for ${asin} (context=${context})`);
    return false;
  }
  return true;
}
