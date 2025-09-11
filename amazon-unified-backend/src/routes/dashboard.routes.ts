/**
 * Dashboard Routes - Real-time metrics from database
 */

import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { optionalApiKey } from '../middleware/apiKey.middleware';

const router = Router();

// Get dashboard summary (alias for root endpoint)
router.get('/summary', optionalApiKey, async (_req: Request, res: Response): Promise<Response> => {
  return dashboardHandler(_req, res);
});

// Get dashboard overview
router.get('/', optionalApiKey, async (_req: Request, res: Response): Promise<Response> => {
  return dashboardHandler(_req, res);
});

// Dashboard handler function
const dashboardHandler = async (_req: Request, res: Response): Promise<Response> => {
  try {
    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get yesterday for comparison
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Get last 30 days for trends
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Today's metrics
    const todayMetrics = await pool.query(`
      SELECT 
        COUNT(*) as orders,
        COALESCE(SUM(order_total_amount::numeric), 0) as revenue,
        COALESCE(AVG(order_total_amount::numeric), 0) as avg_order_value
      FROM orders
      WHERE purchase_date >= $1 AND purchase_date < $2
    `, [today.toISOString(), tomorrow.toISOString()]);

    // Yesterday's metrics for comparison
    const yesterdayMetrics = await pool.query(`
      SELECT 
        COUNT(*) as orders,
        COALESCE(SUM(order_total_amount::numeric), 0) as revenue
      FROM orders
      WHERE purchase_date >= $1 AND purchase_date < $2
    `, [yesterday.toISOString(), today.toISOString()]);

    // Last 30 days metrics
    const last30Days = await pool.query(`
      SELECT 
        COUNT(*) as orders,
        COALESCE(SUM(order_total_amount::numeric), 0) as revenue,
        COUNT(DISTINCT buyer_email) as customers
      FROM orders
      WHERE purchase_date >= $1 AND purchase_date < $2
    `, [thirtyDaysAgo.toISOString(), tomorrow.toISOString()]);

    // Product metrics
    const productMetrics = await pool.query(`
      SELECT 
        COUNT(DISTINCT asin) as total_products,
        COUNT(DISTINCT CASE WHEN in_stock = true THEN asin END) as active_products
      FROM products
    `);

    // Recent orders
    const recentOrders = await pool.query(`
      SELECT 
        amazon_order_id,
        purchase_date,
        order_total_amount,
        order_status,
        buyer_name,
        number_of_items_shipped + number_of_items_unshipped as number_of_items
      FROM orders
      ORDER BY purchase_date DESC
      LIMIT 10
    `);

    // Top products
    const topProducts = await pool.query(`
      SELECT 
        p.asin,
        p.title,
        p.sku,
        p.image_url,
        COUNT(oi.amazon_order_id) as order_count,
        SUM(oi.quantity_ordered) as units_sold,
        SUM(oi.item_price::numeric * oi.quantity_ordered) as revenue
      FROM products p
      LEFT JOIN order_items oi ON p.asin = oi.asin
      WHERE oi.amazon_order_id IS NOT NULL
      GROUP BY p.asin, p.title, p.sku, p.image_url
      ORDER BY revenue DESC NULLS LAST
      LIMIT 5
    `);

    const todayData = todayMetrics.rows[0];
    const yesterdayData = yesterdayMetrics.rows[0];
    const thirtyDayData = last30Days.rows[0];
    const productData = productMetrics.rows[0];

    // Calculate changes
    const orderChange = yesterdayData.orders > 0 
      ? ((todayData.orders - yesterdayData.orders) / yesterdayData.orders * 100)
      : 0;
    const revenueChange = yesterdayData.revenue > 0
      ? ((todayData.revenue - yesterdayData.revenue) / yesterdayData.revenue * 100)
      : 0;

    return res.json({
      overview: {
        todayOrders: parseInt(todayData.orders),
        todayRevenue: parseFloat(todayData.revenue),
        avgOrderValue: parseFloat(todayData.avg_order_value),
        orderChange: orderChange,
        revenueChange: revenueChange,
        last30DaysOrders: parseInt(thirtyDayData.orders),
        last30DaysRevenue: parseFloat(thirtyDayData.revenue),
        totalCustomers: parseInt(thirtyDayData.customers),
        totalProducts: parseInt(productData.total_products),
        activeProducts: parseInt(productData.active_products)
      },
      recentOrders: recentOrders.rows.map(order => ({
        id: order.amazon_order_id,
        date: order.purchase_date,
        total: parseFloat(order.order_total_amount),
        status: order.order_status,
        customer: order.buyer_name || 'Anonymous',
        items: order.number_of_items
      })),
      topProducts: topProducts.rows.map(product => ({
        asin: product.asin,
        title: product.title,
        sku: product.sku,
        imageUrl: product.image_url,
        orderCount: parseInt(product.order_count),
        unitsSold: parseInt(product.units_sold || 0),
        revenue: parseFloat(product.revenue || 0)
      })),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching dashboard data:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch dashboard data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get dashboard stats
router.get('/stats', optionalApiKey, async (req: Request, res: Response): Promise<Response> => {
  try {
    const { period = '7d' } = req.query;
    
    // Calculate date range based on period
    const endDate = new Date();
    const startDate = new Date();
    
    switch(period) {
      case '24h':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }

    // Get aggregated metrics
    const metrics = await pool.query(`
      SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(order_total_amount::numeric), 0) as total_revenue,
        COALESCE(AVG(order_total_amount::numeric), 0) as avg_order_value,
        COUNT(DISTINCT buyer_email) as unique_customers,
        COUNT(DISTINCT DATE(purchase_date)) as days_with_orders
      FROM orders
      WHERE purchase_date >= $1 AND purchase_date <= $2
    `, [startDate.toISOString(), endDate.toISOString()]);

    const data = metrics.rows[0];

    return res.json({
      period,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      stats: {
        totalOrders: parseInt(data.total_orders),
        totalRevenue: parseFloat(data.total_revenue),
        avgOrderValue: parseFloat(data.avg_order_value),
        uniqueCustomers: parseInt(data.unique_customers),
        ordersPerDay: data.days_with_orders > 0 
          ? Math.round(parseInt(data.total_orders) / parseInt(data.days_with_orders))
          : 0,
        revenuePerDay: data.days_with_orders > 0
          ? parseFloat(data.total_revenue) / parseInt(data.days_with_orders)
          : 0
      }
    });
  } catch (error) {
    logger.error('Error fetching dashboard stats:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch dashboard stats',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as dashboardRouter };