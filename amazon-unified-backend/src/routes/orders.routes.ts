import express from 'express';
import { pool } from '../config/database';
import { optionalApiKey } from '../middleware/apiKey.middleware';
import { logger } from '../utils/logger';
import { clerkAuth } from '../middleware/clerk.middleware';

const router = express.Router();

// Get orders with pagination
router.get('/', optionalApiKey, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      startDate, 
      endDate,
      status,
      search 
    } = req.query;
    
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    let query = `
      SELECT 
        o.amazon_order_id,
        o.purchase_date,
        o.order_status,
        o.order_total_amount,
        o.order_total_currency,
        o.buyer_email,
        o.buyer_name,
        o.marketplace_id,
        o.fulfillment_channel,
        o.sales_channel,
        o.ship_service_level,
        o.number_of_items_shipped,
        o.number_of_items_unshipped,
        o.is_prime,
        o.shipment_service_level_category,
        o.updated_at,
        COUNT(oi.order_item_id) as total_items,
        COALESCE(SUM(oi.quantity_ordered), 0) as total_quantity
      FROM orders o
      LEFT JOIN order_items oi ON o.amazon_order_id = oi.amazon_order_id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (startDate) {
      query += ` AND o.purchase_date >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND o.purchase_date <= $${paramIndex++}`;
      params.push(endDate);
    }

    if (status) {
      query += ` AND o.order_status = $${paramIndex++}`;
      params.push(status);
    }

    if (search) {
      query += ` AND (o.amazon_order_id ILIKE $${paramIndex++} OR o.buyer_email ILIKE $${paramIndex} OR o.buyer_name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` GROUP BY o.amazon_order_id, o.purchase_date, o.order_status, o.order_total_amount, o.order_total_currency, o.buyer_email, o.buyer_name, o.marketplace_id, o.fulfillment_channel, o.sales_channel, o.ship_service_level, o.number_of_items_shipped, o.number_of_items_unshipped, o.is_prime, o.shipment_service_level_category, o.updated_at`;
    query += ` ORDER BY o.purchase_date DESC`;
    query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(parseInt(limit as string), offset);

    const result = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) as total FROM orders WHERE 1=1`;
    const countParams: any[] = [];
    let countParamIndex = 1;

    if (startDate) {
      countQuery += ` AND purchase_date >= $${countParamIndex++}`;
      countParams.push(startDate);
    }

    if (endDate) {
      countQuery += ` AND purchase_date <= $${countParamIndex++}`;
      countParams.push(endDate);
    }

    if (status) {
      countQuery += ` AND order_status = $${countParamIndex++}`;
      countParams.push(status);
    }

    if (search) {
      countQuery += ` AND (amazon_order_id ILIKE $${countParamIndex++} OR buyer_email ILIKE $${countParamIndex} OR buyer_name ILIKE $${countParamIndex})`;
      countParams.push(`%${search}%`);
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalItems = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalItems / parseInt(limit as string));

    return res.json({
      orders: result.rows.map(order => ({
        orderId: order.amazon_order_id,
        purchaseDate: order.purchase_date,
        orderStatus: order.order_status,
        orderTotal: parseFloat(order.order_total_amount || 0),
        currency: order.order_total_currency,
        buyerEmail: order.buyer_email,
        buyerName: order.buyer_name || 'Anonymous',
        marketplaceId: order.marketplace_id,
        fulfillmentChannel: order.fulfillment_channel,
        salesChannel: order.sales_channel,
        shipServiceLevel: order.ship_service_level,
        itemsShipped: parseInt(order.number_of_items_shipped || 0),
        itemsUnshipped: parseInt(order.number_of_items_unshipped || 0),
        isPrime: order.is_prime,
        shipmentServiceLevelCategory: order.shipment_service_level_category,
        totalItems: parseInt(order.total_items),
        totalQuantity: parseInt(order.total_quantity),
        updatedAt: order.updated_at
      })),
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total: totalItems,
        totalPages
      }
    });
  } catch (error) {
    logger.error('Error fetching orders:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch orders',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get order summary
router.get('/summary', optionalApiKey, async (req, res) => {
  try {
    const { period = '30d' } = req.query;

    let dateFilter = '';
    const now = new Date();
    
    switch (period) {
      case '7d':
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        dateFilter = `WHERE purchase_date >= '${sevenDaysAgo.toISOString()}'`;
        break;
      case '30d':
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        dateFilter = `WHERE purchase_date >= '${thirtyDaysAgo.toISOString()}'`;
        break;
      case '90d':
        const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        dateFilter = `WHERE purchase_date >= '${ninetyDaysAgo.toISOString()}'`;
        break;
      case 'all':
      default:
        dateFilter = '';
        break;
    }

    const summaryQuery = `
      SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(order_total_amount::numeric), 0) as total_revenue,
        COALESCE(AVG(order_total_amount::numeric), 0) as avg_order_value,
        COUNT(DISTINCT buyer_email) as unique_customers,
        COUNT(CASE WHEN order_status = 'Shipped' THEN 1 END) as shipped_orders,
        COUNT(CASE WHEN order_status = 'Pending' THEN 1 END) as pending_orders,
        COUNT(CASE WHEN order_status = 'Cancelled' THEN 1 END) as cancelled_orders,
        COUNT(CASE WHEN is_prime = true THEN 1 END) as prime_orders,
        COALESCE(SUM(number_of_items_shipped + number_of_items_unshipped), 0) as total_items
      FROM orders
      ${dateFilter}
    `;

    const result = await pool.query(summaryQuery);
    const summary = result.rows[0];

    // Get order status distribution
    const statusQuery = `
      SELECT 
        order_status,
        COUNT(*) as count,
        COALESCE(SUM(order_total_amount::numeric), 0) as revenue
      FROM orders
      ${dateFilter}
      GROUP BY order_status
    `;

    const statusResult = await pool.query(statusQuery);

    // Get daily order trends
    const trendsQuery = `
      SELECT 
        DATE(purchase_date) as date,
        COUNT(*) as orders,
        COALESCE(SUM(order_total_amount::numeric), 0) as revenue
      FROM orders
      ${dateFilter}
      GROUP BY DATE(purchase_date)
      ORDER BY date DESC
      LIMIT 30
    `;

    const trendsResult = await pool.query(trendsQuery);

    return res.json({
      summary: {
        totalOrders: parseInt(summary.total_orders),
        totalRevenue: parseFloat(summary.total_revenue),
        avgOrderValue: parseFloat(summary.avg_order_value),
        uniqueCustomers: parseInt(summary.unique_customers),
        shippedOrders: parseInt(summary.shipped_orders),
        pendingOrders: parseInt(summary.pending_orders),
        cancelledOrders: parseInt(summary.cancelled_orders),
        primeOrders: parseInt(summary.prime_orders),
        totalItems: parseInt(summary.total_items)
      },
      statusDistribution: statusResult.rows.map(status => ({
        status: status.order_status,
        count: parseInt(status.count),
        revenue: parseFloat(status.revenue)
      })),
      dailyTrends: trendsResult.rows.map(trend => ({
        date: trend.date,
        orders: parseInt(trend.orders),
        revenue: parseFloat(trend.revenue)
      }))
    });
  } catch (error) {
    logger.error('Error fetching order summary:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch order summary',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get single order details
router.get('/:orderId', clerkAuth, async (req, res) => {
  try {
    const { orderId } = req.params;

    const orderQuery = `
      SELECT * FROM orders WHERE amazon_order_id = $1
    `;

    const orderResult = await pool.query(orderQuery, [orderId]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // Get order items
    const itemsQuery = `
      SELECT 
        oi.*,
        p.title as product_title,
        p.image_url as product_image_url,
        p.category as product_category,
        p.brand as product_brand
      FROM order_items oi
      LEFT JOIN products p ON oi.asin = p.asin
      WHERE oi.amazon_order_id = $1
    `;

    const itemsResult = await pool.query(itemsQuery, [orderId]);

    return res.json({
      order: {
        orderId: order.amazon_order_id,
        purchaseDate: order.purchase_date,
        orderStatus: order.order_status,
        orderTotal: parseFloat(order.order_total_amount || 0),
        currency: order.order_total_currency,
        buyerEmail: order.buyer_email,
        buyerName: order.buyer_name || 'Anonymous',
        marketplaceId: order.marketplace_id,
        fulfillmentChannel: order.fulfillment_channel,
        salesChannel: order.sales_channel,
        shipServiceLevel: order.ship_service_level,
        itemsShipped: parseInt(order.number_of_items_shipped || 0),
        itemsUnshipped: parseInt(order.number_of_items_unshipped || 0),
        isPrime: order.is_prime,
        shipmentServiceLevelCategory: order.shipment_service_level_category,
        updatedAt: order.updated_at
      },
      items: itemsResult.rows.map(item => ({
        orderItemId: item.order_item_id,
        asin: item.asin,
        sellerSku: item.seller_sku,
        title: item.title || item.product_title || 'Unknown Product',
        productTitle: item.product_title,
        productImageUrl: item.product_image_url,
        productCategory: item.product_category,
        productBrand: item.product_brand,
        quantityOrdered: parseInt(item.quantity_ordered || 0),
        quantityShipped: parseInt(item.quantity_shipped || 0),
        itemPrice: parseFloat(item.item_price || 0),
        itemTax: parseFloat(item.item_tax || 0),
        promotionDiscount: parseFloat(item.promotion_discount_amount || 0),
        isGift: item.is_gift,
        conditionId: item.condition_id
      }))
    });
  } catch (error) {
    logger.error('Error fetching order details:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch order details',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export const ordersRouter = router;