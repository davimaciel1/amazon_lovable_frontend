/**
 * Sales Routes - Real data from database
 */

import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { requireAuthOrApiKey } from '../middleware/apiKey.middleware';

const router = Router();

// Protect all sales routes
router.use(requireAuthOrApiKey);

// Get sales metrics endpoint
router.get('/metrics', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const query = `
      SELECT 
        COUNT(DISTINCT o.amazon_order_id) as total_orders,
        COUNT(DISTINCT oi.asin) as unique_products,
        SUM(oi.quantity_ordered) as total_units,
        SUM(oi.item_price::numeric * oi.quantity_ordered) as total_revenue,
        AVG(o.order_total_amount::numeric) as avg_order_value
      FROM orders o
      LEFT JOIN order_items oi ON o.amazon_order_id = oi.amazon_order_id
      WHERE ($1::date IS NULL OR o.purchase_date >= $1)
        AND ($2::date IS NULL OR o.purchase_date <= $2)
    `;
    
    const result = await pool.query(query, [startDate || null, endDate || null]);
    
    res.json({
      success: true,
      data: result.rows[0],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching sales metrics:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch sales metrics' 
    });
  }
});

// Get sales data with real database information
router.get('/', async (req: Request, res: Response): Promise<Response> => {
  try {
    const { 
      startDate, 
      endDate, 
      page = 1, 
      limit = 50,
      // sortBy = 'purchaseDate',
      sortDir = 'desc' 
    } = req.query;

    // Ensure page and limit are numbers
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 50;
    const offset = (pageNum - 1) * limitNum;

    // Query for aggregated sales by ASIN and Seller
    // This query shows ALL products sold, even if not in products table
    const query = `
      WITH sales_aggregated AS (
        SELECT 
          oi.asin,
          oi.seller_sku as sku,
          COALESCE(p.title, oi.title, 'Product ' || oi.asin) as product_name,
          COALESCE(p.image_url, oi.image_url) as image_url,
          p.local_image_url,
          COALESCE(p.buy_box_seller, 'Unknown') as seller_id,
          COALESCE(p.buy_box_seller, 'Unknown Seller') as seller_name,
          COUNT(DISTINCT o.amazon_order_id) as order_count,
          SUM(oi.quantity_ordered) as total_quantity,
          SUM(COALESCE(oi.price_amount, oi.item_price, 0) * oi.quantity_ordered) as total_revenue,
          AVG(COALESCE(oi.price_amount, oi.item_price, 0)) as avg_price,
          MAX(o.purchase_date) as last_sale_date,
          MIN(o.purchase_date) as first_sale_date,
          COALESCE(p.inventory_quantity, 0) as stock,
          COALESCE(p.seller_count, 1) as competitor_count,
          o.marketplace_id
        FROM orders o
        INNER JOIN order_items oi ON o.amazon_order_id = oi.amazon_order_id
        LEFT JOIN products p ON oi.asin = p.asin
        WHERE o.purchase_date >= $1 AND o.purchase_date <= $2
          AND oi.asin IS NOT NULL
        GROUP BY 
          oi.asin,
          oi.seller_sku,
          p.title,
          oi.title,
          p.image_url,
          oi.image_url,
          p.local_image_url,
          p.buy_box_seller,
          p.inventory_quantity,
          p.seller_count,
          o.marketplace_id
      )
      SELECT * FROM sales_aggregated
      ORDER BY total_revenue ${sortDir === 'asc' ? 'ASC' : 'DESC'}
      LIMIT $3::integer OFFSET $4::integer
    `;

    const values = [startDate || '2024-01-01', endDate || new Date().toISOString(), limitNum, offset];
    const result = await pool.query(query, values);

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(DISTINCT oi.asin || '-' || COALESCE(p.buy_box_seller, 'unknown')) as total
      FROM orders o
      INNER JOIN order_items oi ON o.amazon_order_id = oi.amazon_order_id
      LEFT JOIN products p ON oi.asin = p.asin
      WHERE o.purchase_date >= $1 AND o.purchase_date <= $2
        AND oi.asin IS NOT NULL
    `;
    const countResult = await pool.query(countQuery, [startDate || '2024-01-01', endDate || new Date().toISOString()]);
    const totalItems = parseInt(countResult.rows[0].total);

    // Transform aggregated data to sales format
    const sales = result.rows.map(row => {
      // Prefer image URLs stored in the database: local > product > order item
      let imageUrl = row.local_image_url || row.image_url || null;
      
      // Convert HTTP to HTTPS if needed
      if (imageUrl && imageUrl.startsWith('http://')) {
        imageUrl = imageUrl.replace('http://', 'https://');
      }

      return {
        id: `${row.asin}-${row.seller_id || 'unknown'}`,
        asin: row.asin,
        sellerName: row.seller_name || 'Unknown Seller',
        sellerId: row.seller_id || 'unknown',
        productName: row.product_name || 'Unknown Product',
        sku: row.sku || row.asin,
        orderCount: parseInt(row.order_count) || 0,
        totalQuantity: parseInt(row.total_quantity) || 0,
        revenue: parseFloat(row.total_revenue) || 0,
        avgPrice: parseFloat(row.avg_price) || 0,
        lastSaleDate: row.last_sale_date,
        firstSaleDate: row.first_sale_date,
        profit: (parseFloat(row.total_revenue) || 0) * 0.15, // Estimated 15% profit margin
        stock: row.stock || 0,
        competitorCount: row.competitor_count || 0,
        marketplace_id: row.marketplace_id || 'ATVPDKIKX0DER',  // Include marketplace
        imageUrl: imageUrl,
        image_url: imageUrl,  // Include both formats for compatibility
        // For backward compatibility, include items array with single aggregated item
        items: [{
          name: row.product_name || 'Unknown Product',
          sku: row.sku || row.asin,
          asin: row.asin,
          quantity: parseInt(row.total_quantity) || 0,
          price: parseFloat(row.avg_price) || 0,
          imageUrl: imageUrl,
          image_url: imageUrl,
          stock: row.stock || 0,
          buy_box_winner: row.seller_name || 'Unknown',
          sellers: row.competitor_count || 1
        }]
      };
    });

    return res.json({
      sales,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalItems,
        totalPages: Math.ceil(totalItems / limitNum)
      },
      summary: {
        totalRevenue: sales.reduce((sum, sale) => sum + sale.revenue, 0),
        totalProfit: sales.reduce((sum, sale) => sum + sale.profit, 0),
        totalOrders: sales.length,
        averageOrderValue: sales.length > 0 ? sales.reduce((sum, sale) => sum + sale.revenue, 0) / sales.length : 0
      }
    });
  } catch (error) {
    logger.error('Error fetching sales data:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch sales data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// TEST ROUTE
router.get('/test', async (_req: Request, res: Response): Promise<Response> => {
  try {
    const result = await pool.query(`
      SELECT 
        p.asin,
        p.title,
        p.image_url,
        p.local_image_url
      FROM products p
      LIMIT 3
    `);
    
    return res.json({
      success: true,
      message: 'Test route - showing product images',
      products: result.rows
    });
  } catch (error) {
    return res.status(500).json({ error: 'Test route error' });
  }
});

export { router as salesRouter };
