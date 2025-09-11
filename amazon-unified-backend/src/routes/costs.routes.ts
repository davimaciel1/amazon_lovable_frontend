import express from 'express';
import { pool } from '../config/database';
import { requireApiKey } from '../middleware/apiKey.middleware';
import { logger } from '../utils/logger';

const router = express.Router();

// Ensure sku_costs table exists (idempotent)
async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sku_costs (
      id SERIAL PRIMARY KEY,
      sku TEXT NOT NULL,
      marketplace_id TEXT NOT NULL,
      start_date DATE DEFAULT CURRENT_DATE,
      end_date DATE NULL,
      -- Manual fields only (per user's rule)
      custos_manuais BOOLEAN,
      compra NUMERIC,
      armazenagem NUMERIC,
      frete_amazon NUMERIC,
      custos_percentuais NUMERIC,
      imposto_percent NUMERIC,
      custo_variavel_percent NUMERIC,
      margem_contribuicao_percent NUMERIC,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (sku, marketplace_id, start_date)
    );
  `);
}

// Upsert per-SKU costs for a marketplace
// POST /api/costs/sku/upsert
// Body: { sku, marketplace_id, start_date?, end_date?, [allowed manual fields] }
router.post('/sku/upsert', requireApiKey, async (req, res) => {
  try {
    await ensureTable();

    const body = req.body || {};
    const sku = (body.sku || '').toString().trim();
    const marketplaceId = (body.marketplace_id || 'MLB').toString().trim();
    const startDate = body.start_date ? new Date(body.start_date) : null;
    const endDate = body.end_date ? new Date(body.end_date) : null;

    if (!sku) return res.status(400).json({ error: 'sku is required' });
    if (!marketplaceId) return res.status(400).json({ error: 'marketplace_id is required' });

    // Map and validate allowed fields only
    const keyMap: Record<string, string> = {
      custos_manuais: 'custos_manuais',
      custosManuais: 'custos_manuais',
      compra: 'compra',
      armazenagem: 'armazenagem',
      frete_amazon: 'frete_amazon',
      freteAmazon: 'frete_amazon',
      custos_percentuais: 'custos_percentuais',
      custosPercentuais: 'custos_percentuais',
      imposto_percent: 'imposto_percent',
      imposto: 'imposto_percent',
      custo_variavel_percent: 'custo_variavel_percent',
      custoVariavel: 'custo_variavel_percent',
      margem_contribuicao_percent: 'margem_contribuicao_percent',
      margemContribuicao: 'margem_contribuicao_percent',
    };

    const payloadEntries: Array<[string, any]> = Object.entries(body)
      .map(([k, v]) => [keyMap[k] || '', v] as [string, any])
      .filter(([k]) => Boolean(k));

    const numericFields = new Set([
      'compra',
      'armazenagem',
      'frete_amazon',
      'custos_percentuais',
      'imposto_percent',
      'custo_variavel_percent',
      'margem_contribuicao_percent',
    ]);
    const percentFields = new Set([
      'custos_percentuais',
      'imposto_percent',
      'custo_variavel_percent',
      'margem_contribuicao_percent',
    ]);

    // Build upsert
    const cols = ['sku', 'marketplace_id'];
    const vals: any[] = [sku, marketplaceId];
    const ph: string[] = ['$1', '$2'];

    if (startDate) { cols.push('start_date'); vals.push(startDate.toISOString().slice(0, 10)); ph.push(`$${ph.length + 1}`); }
    if (endDate) { cols.push('end_date'); vals.push(endDate.toISOString().slice(0, 10)); ph.push(`$${ph.length + 1}`); }

    for (const [col, raw] of payloadEntries) {
      if (col === 'custos_manuais') {
        cols.push(col); vals.push(Boolean(raw)); ph.push(`$${ph.length + 1}`); continue;
      }
      if (numericFields.has(col)) {
        const num = Number(raw);
        if (Number.isNaN(num)) return res.status(400).json({ error: `Field ${col} must be a number` });
        if (percentFields.has(col) && (num < 0 || num > 100)) return res.status(400).json({ error: `Field ${col} must be 0..100` });
        cols.push(col); vals.push(num); ph.push(`$${ph.length + 1}`);
      }
    }

    if (cols.length === 2 && !startDate && !endDate) {
      return res.status(400).json({ error: 'No cost fields provided' });
    }

    const updates = cols
      .filter(c => !['sku', 'marketplace_id', 'start_date'].includes(c))
      .map(c => `${c} = EXCLUDED.${c}`);
    updates.push('updated_at = NOW()');

    const sql = `
      INSERT INTO sku_costs (${cols.join(', ')})
      VALUES (${ph.join(', ')})
      ON CONFLICT (sku, marketplace_id, start_date)
      DO UPDATE SET ${updates.join(', ')}
      RETURNING *;
    `;

    const result = await pool.query(sql, vals);
    return res.json({ ok: true, cost: result.rows[0] });
  } catch (e: any) {
    logger.error('SKU cost upsert failed', e);
    return res.status(500).json({ error: e.message || 'Failed to upsert sku costs' });
  }
});

export const costsRouter = router;
