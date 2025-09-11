import { pool } from '../config/database';
import { logger } from '../utils/logger';

export interface ImageAuditRecord {
  asin: string;
  old_image_url: string | null;
  new_image_url: string | null;
  old_local_image_url: string | null;
  new_local_image_url: string | null;
  was_blocked: boolean;
  reason?: string | null;
  actor?: string | null;
  source?: string | null;
}

class ImageAuditService {
  private ensured = false;

  private async ensureTable() {
    if (this.ensured) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS image_change_audit (
        id BIGSERIAL PRIMARY KEY,
        asin TEXT NOT NULL,
        old_image_url TEXT,
        new_image_url TEXT,
        old_local_image_url TEXT,
        new_local_image_url TEXT,
        was_blocked BOOLEAN DEFAULT false,
        reason TEXT,
        actor TEXT,
        source TEXT,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_image_change_audit_asin ON image_change_audit(asin);
    `);
    this.ensured = true;
  }

  async record(change: ImageAuditRecord): Promise<void> {
    try {
      await this.ensureTable();
      await pool.query(
        `INSERT INTO image_change_audit (
          asin, old_image_url, new_image_url,
          old_local_image_url, new_local_image_url,
          was_blocked, reason, actor, source
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          change.asin,
          change.old_image_url,
          change.new_image_url,
          change.old_local_image_url,
          change.new_local_image_url,
          !!change.was_blocked,
          change.reason || null,
          change.actor || null,
          change.source || null,
        ]
      );
    } catch (err) {
      logger.error('Failed to record image change audit', err);
    }
  }
}

export const imageAudit = new ImageAuditService();
