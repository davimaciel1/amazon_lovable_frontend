import express from 'express';
import axios from 'axios';
import { vannaConfig } from '../config/vanna';
import { optionalApiKey } from '../middleware/apiKey.middleware';
import { pool } from '../config/database';

const router = express.Router();

// Health check for Vanna integration
router.get('/health', optionalApiKey, async (_req, res) => {
  if (!vannaConfig.enabled) {
    return res.status(503).json({ ok: false, enabled: false });
  }
  try {
    const r = await axios.get(`${vannaConfig.baseUrl}/health`, { timeout: vannaConfig.timeoutMs });
    return res.json({ ok: true, vanna: r.data });
  } catch (e: any) {
    return res.status(502).json({ ok: false, error: e.message || 'Vanna health error' });
  }
});

// Generate SQL from natural language via Vanna
router.post('/generate-sql', optionalApiKey, async (req, res) => {
  if (!vannaConfig.enabled) {
    return res.status(503).json({ error: 'Vanna integration disabled' });
  }
  const { question, schema } = req.body || {};
  if (!question) return res.status(400).json({ error: 'question is required' });

  try {
    const r = await axios.post(
      `${vannaConfig.baseUrl}/generate_sql`,
      { question, schema },
      { timeout: vannaConfig.timeoutMs }
    );
    return res.json({ sql: r.data?.sql || r.data, meta: r.data });
  } catch (e: any) {
    return res.status(502).json({ error: e.response?.data || e.message || 'Vanna generate_sql failed' });
  }
});

// Ask Vanna (optionally executes SQL on Vanna side and returns results)
router.post('/ask', optionalApiKey, async (req, res) => {
  if (!vannaConfig.enabled) {
    return res.status(503).json({ error: 'Vanna integration disabled' });
  }
  const { question, raw = false } = req.body || {};
  if (!question) return res.status(400).json({ error: 'question is required' });

  try {
    const r = await axios.post(
      `${vannaConfig.baseUrl}/ask`,
      { question, raw },
      { timeout: vannaConfig.timeoutMs }
    );
    return res.json(r.data);
  } catch (e: any) {
    return res.status(502).json({ error: e.response?.data || e.message || 'Vanna ask failed' });
  }
});

export { router as vannaRouter };

// Additional helpers
router.get('/schema', optionalApiKey, async (_req, res) => {
  try {
    const q = `
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema='public'
      ORDER BY table_name, ordinal_position
    `;
    const { rows } = await pool.query(q);
    const schema: Record<string, { columns: { name: string; type: string }[] }> = {};
    for (const r of rows) {
      if (!schema[r.table_name]) schema[r.table_name] = { columns: [] };
      schema[r.table_name].columns.push({ name: r.column_name, type: r.data_type });
    }
    res.json({ schema });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to fetch schema' });
  }
});

// Execute SQL safely (SELECT-only)
router.post('/execute-sql', optionalApiKey, async (req, res) => {
  const { sql, limit } = req.body || {};
  if (!sql || typeof sql !== 'string') {
    return res.status(400).json({ error: 'sql is required' });
  }
  const trimmed = sql.trim();
  // Basic safety: only allow SELECT; reject dangerous keywords
  const upper = trimmed.toUpperCase();
  if (!upper.startsWith('SELECT')) {
    return res.status(400).json({ error: 'Only SELECT statements are allowed' });
  }
  if (/;\s*$/m.test(trimmed)) {
    // prevent multiple statements separated by ;
    return res.status(400).json({ error: 'Multiple statements are not allowed' });
  }
  if (/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|GRANT|REVOKE|CREATE)\b/i.test(trimmed)) {
    return res.status(400).json({ error: 'Statement contains forbidden keywords' });
  }
  const rowLimit = Math.max(1, Math.min(Number(limit) || 1000, 5000));
  const finalSql = /\bLIMIT\b/i.test(trimmed) ? trimmed : `${trimmed} LIMIT ${rowLimit}`;
  try {
    const result = await pool.query(finalSql);
    return res.json({
      rowCount: result.rowCount,
      fields: result.fields?.map((f: any) => ({ name: f.name })) || [],
      rows: result.rows,
      sql: finalSql,
    });
  } catch (e: any) {
    return res.status(400).json({ error: e.message || 'Query failed' });
  }
});
