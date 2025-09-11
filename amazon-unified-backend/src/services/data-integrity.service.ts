import { pool } from '../config/database';
import { logger } from '../utils/logger';

export async function repairRecentPrices(days: number = 30): Promise<{ updated: Record<string, number> }> {
  const updated: Record<string, number> = {};
  const w = [days];

  // 1) item_price * qty
  const r2 = await pool.query(
    `UPDATE order_items oi
     SET price_amount = ROUND(oi.item_price * oi.quantity_ordered, 2)
     FROM orders o
     WHERE oi.amazon_order_id = o.amazon_order_id
       AND o.purchase_date >= NOW() - ($1 || ' days')::interval
       AND (oi.price_amount IS NULL OR oi.price_amount = 0)
       AND oi.item_price IS NOT NULL AND oi.item_price > 0
       AND oi.quantity_ordered > 0`,
    w,
  );
  updated.item_price_qty = r2.rowCount || 0;

  // 2) products.price * qty
  const r3 = await pool.query(
    `UPDATE order_items oi
     SET price_amount = ROUND(p.price * oi.quantity_ordered, 2)
     FROM orders o, products p
     WHERE oi.amazon_order_id = o.amazon_order_id
       AND p.asin = oi.asin
       AND o.purchase_date >= NOW() - ($1 || ' days')::interval
       AND (oi.price_amount IS NULL OR oi.price_amount = 0)
       AND p.price IS NOT NULL AND p.price > 0
       AND oi.quantity_ordered > 0`,
    w,
  );
  updated.products_price_qty = r3.rowCount || 0;

  // 3) Product."currentPrice" * qty
  const r4 = await pool.query(
    `UPDATE order_items oi
     SET price_amount = ROUND(prod."currentPrice" * oi.quantity_ordered, 2)
     FROM orders o, "Product" prod
     WHERE oi.amazon_order_id = o.amazon_order_id
       AND prod.asin = oi.asin
       AND o.purchase_date >= NOW() - ($1 || ' days')::interval
       AND (oi.price_amount IS NULL OR oi.price_amount = 0)
       AND prod."currentPrice" IS NOT NULL AND prod."currentPrice" > 0
       AND oi.quantity_ordered > 0`,
    w,
  );
  updated.product_current_price_qty = r4.rowCount || 0;

  // 4) Distribute order_total_amount
  const r5 = await pool.query(
    `WITH order_qty AS (
       SELECT oi.amazon_order_id, SUM(oi.quantity_ordered) AS total_qty
       FROM order_items oi
       JOIN orders o ON o.amazon_order_id = oi.amazon_order_id
       WHERE o.purchase_date >= NOW() - ($1 || ' days')::interval
       GROUP BY oi.amazon_order_id
     )
     UPDATE order_items oi
     SET price_amount = ROUND(((o.order_total_amount::numeric / NULLIF(oq.total_qty, 0)) * oi.quantity_ordered), 2)
     FROM orders o
     JOIN order_qty oq ON oq.amazon_order_id = o.amazon_order_id
     WHERE oi.amazon_order_id = o.amazon_order_id
       AND o.purchase_date >= NOW() - ($1 || ' days')::interval
       AND (oi.price_amount IS NULL OR oi.price_amount = 0)
       AND o.order_total_amount IS NOT NULL AND o.order_total_amount > 0
       AND oi.quantity_ordered > 0`,
    w,
  );
  updated.distributed_order_total = r5.rowCount || 0;

  // 5) Recompute orders.order_total_amount from items when 0 or null
  const r7 = await pool.query(
    `WITH sums AS (
       SELECT oi.amazon_order_id, SUM(COALESCE(oi.price_amount, 0)) AS sum_items
       FROM order_items oi
       JOIN orders o ON o.amazon_order_id = oi.amazon_order_id
       WHERE o.purchase_date >= NOW() - ($1 || ' days')::interval
       GROUP BY oi.amazon_order_id
     )
     UPDATE orders o
     SET order_total_amount = s.sum_items
     FROM sums s
     WHERE o.amazon_order_id = s.amazon_order_id
       AND (o.order_total_amount IS NULL OR o.order_total_amount = 0)
       AND o.purchase_date >= NOW() - ($1 || ' days')::interval`,
    w,
  );
  updated.recomputed_order_totals = r7.rowCount || 0;

  logger.info('[Integrity] Repair recent prices updated:', updated);
  return { updated };
}

