import express from 'express';
import { pool } from '../config/database';
import { optionalApiKey } from '../middleware/apiKey.middleware';
import { logger } from '../utils/logger';
import { clerkAuth } from '../middleware/clerk.middleware';

const router = express.Router();

// GET /api/ml/orders - list ML orders with pagination and filters
router.get('/', optionalApiKey, async (req, res) => {
  try {
    const {
      page = '1',
      limit = '20',
      startDate,
      endDate,
      status,
      search,
    } = req.query as Record<string, string | undefined>;

    const pageNum = Math.max(parseInt(page || '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit || '20', 10) || 20, 1), 200);
    const offset = (pageNum - 1) * pageSize;

    let query = `
      SELECT 
        o.ml_order_id,
        o.date_created,
        o.date_closed,
        o.last_updated,
        o.status,
        o.status_detail,
        o.total_amount,
        o.paid_amount,
        o.currency_id,
        o.seller_id,
        o.buyer_id,
        o.site_id,
        o.channel,
        o.tags,
        COUNT(oi.id) AS total_items,
        COALESCE(SUM(oi.quantity), 0) AS total_quantity
      FROM ml_orders o
      LEFT JOIN ml_order_items oi ON o.ml_order_id = oi.ml_order_id
      WHERE 1=1
    `;

    const params: any[] = [];
    let idx = 1;

    if (startDate) {
      query += ` AND o.date_created >= $${idx++}`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND o.date_created <= $${idx++}`;
      params.push(endDate);
    }
    if (status) {
      query += ` AND o.status = $${idx++}`;
      params.push(status);
    }
    if (search) {
      query += ` AND (
        o.ml_order_id::text ILIKE $${idx} OR 
        o.seller_id::text ILIKE $${idx} OR 
        o.buyer_id::text ILIKE $${idx}
      )`;
      params.push(`%${search}%`);
      idx++;
    }

    query += ` GROUP BY 
        o.ml_order_id,
        o.date_created,
        o.date_closed,
        o.last_updated,
        o.status,
        o.status_detail,
        o.total_amount,
        o.paid_amount,
        o.currency_id,
        o.seller_id,
        o.buyer_id,
        o.site_id,
        o.channel,
        o.tags
      `;
    query += ` ORDER BY o.date_created DESC`;
    query += ` LIMIT $${idx++} OFFSET $${idx}`;
    params.push(pageSize, offset);

    const result = await pool.query(query, params);

    // Count
    let countQuery = `SELECT COUNT(*) AS total FROM ml_orders o WHERE 1=1`;
    const countParams: any[] = [];
    let cidx = 1;
    if (startDate) {
      countQuery += ` AND o.date_created >= $${cidx++}`;
      countParams.push(startDate);
    }
    if (endDate) {
      countQuery += ` AND o.date_created <= $${cidx++}`;
      countParams.push(endDate);
    }
    if (status) {
      countQuery += ` AND o.status = $${cidx++}`;
      countParams.push(status);
    }
    if (search) {
      countQuery += ` AND (
        o.ml_order_id::text ILIKE $${cidx} OR 
        o.seller_id::text ILIKE $${cidx} OR 
        o.buyer_id::text ILIKE $${cidx}
      )`;
      countParams.push(`%${search}%`);
      cidx++;
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalItems = parseInt(countResult.rows[0]?.total || '0', 10);
    const totalPages = Math.ceil(totalItems / pageSize);

    return res.json({
      orders: result.rows.map((o: any) => ({
        orderId: o.ml_order_id,
        purchaseDate: o.date_created, // keep frontend compatibility
        dateClosed: o.date_closed,
        orderStatus: o.status,
        statusDetail: o.status_detail,
        orderTotal: parseFloat(o.total_amount || 0),
        paidAmount: parseFloat(o.paid_amount || 0),
        currency: o.currency_id,
        buyerId: o.buyer_id,
        sellerId: o.seller_id,
        siteId: o.site_id,
        channel: o.channel,
        tags: o.tags || [],
        totalItems: parseInt(o.total_items || 0, 10),
        totalQuantity: parseInt(o.total_quantity || 0, 10),
        updatedAt: o.last_updated,
      })),
      pagination: {
        page: pageNum,
        limit: pageSize,
        total: totalItems,
        totalPages,
      },
    });
  } catch (error) {
    logger.error('Error fetching ML orders:', error);
    return res.status(500).json({ error: 'Failed to fetch ML orders' });
  }
});

// GET /api/ml/orders/summary - KPIs and distributions
router.get('/summary', optionalApiKey, async (req, res) => {
  try {
    const { period = '30d' } = req.query as Record<string, string | undefined>;

    let dateFilter = '';
    const now = new Date();
    if (period === '7d') {
      const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      dateFilter = `WHERE date_created >= '${d}'`;
    } else if (period === '30d') {
      const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      dateFilter = `WHERE date_created >= '${d}'`;
    } else if (period === '90d') {
      const d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
      dateFilter = `WHERE date_created >= '${d}'`;
    }

    const summarySql = `
      SELECT 
        COUNT(*) AS total_orders,
        COALESCE(SUM(total_amount::numeric), 0) AS total_revenue,
        COALESCE(AVG(total_amount::numeric), 0) AS avg_order_value
      FROM ml_orders
      ${dateFilter}
    `;
    const summary = (await pool.query(summarySql)).rows[0];

    const statusSql = `
      SELECT status, COUNT(*) AS count, COALESCE(SUM(total_amount::numeric), 0) AS revenue
      FROM ml_orders
      ${dateFilter}
      GROUP BY status
    `;
    const statusRows = (await pool.query(statusSql)).rows;

    const trendsSql = `
      SELECT DATE(date_created) AS date, COUNT(*) AS orders, COALESCE(SUM(total_amount::numeric), 0) AS revenue
      FROM ml_orders
      ${dateFilter}
      GROUP BY DATE(date_created)
      ORDER BY date DESC
      LIMIT 30
    `;
    const trendRows = (await pool.query(trendsSql)).rows;

    return res.json({
      summary: {
        totalOrders: parseInt(summary.total_orders || 0, 10),
        totalRevenue: parseFloat(summary.total_revenue || 0),
        avgOrderValue: parseFloat(summary.avg_order_value || 0),
      },
      statusDistribution: statusRows.map((r: any) => ({
        status: r.status,
        count: parseInt(r.count || 0, 10),
        revenue: parseFloat(r.revenue || 0),
      })),
      dailyTrends: trendRows.map((r: any) => ({
        date: r.date,
        orders: parseInt(r.orders || 0, 10),
        revenue: parseFloat(r.revenue || 0),
      })),
    });
  } catch (error) {
    logger.error('Error fetching ML order summary:', error);
    return res.status(500).json({ error: 'Failed to fetch ML order summary' });
  }
});

// GET /api/ml/orders/:orderId - details
router.get('/:orderId', clerkAuth, async (req, res) => {
  try {
    const { orderId } = req.params;

    const orderSql = `SELECT * FROM ml_orders WHERE ml_order_id = $1`;
    const orderResult = await pool.query(orderSql, [orderId]);
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const o = orderResult.rows[0];

    const itemsSql = `
      SELECT * FROM ml_order_items WHERE ml_order_id = $1
    `;
    const items = (await pool.query(itemsSql, [orderId])).rows;

    return res.json({
      order: {
        orderId: o.ml_order_id,
        purchaseDate: o.date_created,
        dateClosed: o.date_closed,
        orderStatus: o.status,
        statusDetail: o.status_detail,
        orderTotal: parseFloat(o.total_amount || 0),
        paidAmount: parseFloat(o.paid_amount || 0),
        currency: o.currency_id,
        buyerId: o.buyer_id,
        sellerId: o.seller_id,
        siteId: o.site_id,
        channel: o.channel,
        tags: o.tags || [],
        updatedAt: o.last_updated,
      },
      items: items.map((it: any) => ({
        itemId: it.item_id,
        title: it.title,
        categoryId: it.category_id,
        variationId: it.variation_id,
        sellerSku: it.seller_sku,
        quantity: parseInt(it.quantity || 0, 10),
        unitPrice: parseFloat(it.unit_price || 0),
        fullUnitPrice: parseFloat(it.full_unit_price || 0),
        currency: it.currency_id,
        saleFee: parseFloat(it.sale_fee || 0),
        listingTypeId: it.listing_type_id,
        variationAttributes: it.variation_attributes,
      })),
    });
  } catch (error) {
    logger.error('Error fetching ML order details:', error);
    return res.status(500).json({ error: 'Failed to fetch ML order details' });
  }
});

export const mlOrdersRouter = router;

