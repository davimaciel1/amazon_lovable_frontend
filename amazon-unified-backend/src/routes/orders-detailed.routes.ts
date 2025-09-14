import express from 'express';
import { pool } from '../config/database';
import { clerkAuth } from '../middleware/clerk.middleware';
import { logger } from '../utils/logger';

const router = express.Router();

// GET /api/orders-detailed - unified detailed orders from Amazon and MercadoLibre
router.get('/', clerkAuth, async (req, res) => {
  try {
    const { 
      page = '1', 
      limit = '20', 
      startDate, 
      endDate,
      channel = 'all', // amazon, mercadolivre, all
      status,
      search 
    } = req.query as Record<string, string>;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);
    const offset = (pageNum - 1) * pageSize;

    // Base queries for both marketplaces
    let amazonQuery = '';
    let mlQuery = '';
    const params: any[] = [];
    let paramIndex = 1;

    // Amazon orders query with address fields and performance optimizations
    if (channel === 'all' || channel === 'amazon') {
      let amazonWhere = 'WHERE 1=1';
      
      if (startDate) {
        amazonWhere += ` AND o.purchase_date >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }
      
      if (endDate) {
        amazonWhere += ` AND o.purchase_date <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }
      
      if (status) {
        amazonWhere += ` AND o.order_status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }
      
      if (search) {
        amazonWhere += ` AND (
          o.amazon_order_id ILIKE $${paramIndex} OR 
          o.buyer_name ILIKE $${paramIndex} OR 
          o.buyer_email ILIKE $${paramIndex} OR
          oi.seller_sku ILIKE $${paramIndex} OR
          COALESCE(oi.title, p.title) ILIKE $${paramIndex}
        )`;
        params.push(`%${search}%`);
        paramIndex++;
      }
      
      amazonQuery = `
        SELECT 
          'amazon' as marketplace,
          o.marketplace_id as marketplace_code,
          o.amazon_order_id as order_id,
          o.purchase_date,
          o.order_status,
          o.order_total_amount as order_total,
          o.order_total_currency as currency,
          o.buyer_name as customer_name,
          o.buyer_email as customer_email,
          '' as customer_id,
          -- Address fields for Amazon orders
          COALESCE(o.ship_city, '') as shipping_city,
          COALESCE(o.ship_state, '') as shipping_state,
          COALESCE(o.ship_postal_code, '') as shipping_postal,
          COALESCE(o.ship_country, '') as shipping_country,
          '' as customer_phone,
          o.is_prime,
          o.fulfillment_channel,
          o.sales_channel,
          o.updated_at,
          -- Order items as JSON aggregation
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'sku', oi.seller_sku,
                'asin', oi.asin,
                'title', COALESCE(oi.title, p.title, 'Unknown Product'),
                'quantity', COALESCE(oi.quantity_ordered, 0),
                'unitPrice', CASE 
                  WHEN COALESCE(oi.quantity_ordered, 1) > 0 
                  THEN COALESCE(oi.item_price::numeric, 0) / COALESCE(oi.quantity_ordered, 1)
                  ELSE COALESCE(oi.item_price::numeric, 0)
                END,
                'totalPrice', COALESCE(oi.item_price::numeric, 0),
                'itemTax', COALESCE(oi.item_tax::numeric, 0),
                'promotionDiscount', COALESCE(oi.promotion_discount_amount::numeric, 0),
                'conditionId', oi.condition_id,
                'isGift', COALESCE(oi.is_gift, false)
              )
              ORDER BY oi.order_item_id
            ) FILTER (WHERE oi.order_item_id IS NOT NULL), 
            '[]'::json
          ) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.amazon_order_id = oi.amazon_order_id
        LEFT JOIN products p ON oi.asin = p.asin
        ${amazonWhere}
        GROUP BY 
          o.marketplace_id,
          o.amazon_order_id,
          o.purchase_date,
          o.order_status,
          o.order_total_amount,
          o.order_total_currency,
          o.buyer_name,
          o.buyer_email,
          o.ship_city,
          o.ship_state,
          o.ship_postal_code,
          o.ship_country,
          o.is_prime,
          o.fulfillment_channel,
          o.sales_channel,
          o.updated_at
      `;
    }

    // MercadoLibre orders query with address fields and performance optimizations  
    if (channel === 'all' || channel === 'mercadolivre') {
      let mlWhere = 'WHERE 1=1';
      
      if (startDate) {
        mlWhere += ` AND mlo.date_created >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }
      
      if (endDate) {
        mlWhere += ` AND mlo.date_created <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }
      
      if (status) {
        mlWhere += ` AND mlo.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }
      
      if (search) {
        mlWhere += ` AND (
          mlo.ml_order_id::text ILIKE $${paramIndex} OR
          mlo.buyer_id::text ILIKE $${paramIndex} OR
          mloi.seller_sku ILIKE $${paramIndex} OR
          mloi.title ILIKE $${paramIndex}
        )`;
        params.push(`%${search}%`);
        paramIndex++;
      }
      
      mlQuery = `
        SELECT 
          'mercadolivre' as marketplace,
          mlo.site_id as marketplace_code,
          mlo.ml_order_id::text as order_id,
          mlo.date_created as purchase_date,
          mlo.status as order_status,
          mlo.total_amount::numeric as order_total,
          mlo.currency_id as currency,
          -- Extract buyer info from raw JSON
          COALESCE(mlo.raw->>'buyer_nickname', '') as customer_name,
          COALESCE(mlo.raw->>'buyer_email', '') as customer_email,
          mlo.buyer_id::text as customer_id,
          -- Extract address from raw JSON (receiver_address)
          COALESCE(mlo.raw->'shipping'->'receiver_address'->>'city', '') as shipping_city,
          COALESCE(mlo.raw->'shipping'->'receiver_address'->>'state', '') as shipping_state,
          COALESCE(mlo.raw->'shipping'->'receiver_address'->>'zip_code', '') as shipping_postal,
          COALESCE(mlo.raw->'shipping'->'receiver_address'->>'country', '') as shipping_country,
          COALESCE(mlo.raw->'buyer'->>'phone', '') as customer_phone,
          false as is_prime,
          CASE 
            WHEN mlo.raw->'shipping'->>'logistic_type' = 'fulfillment' THEN 'fulfillment'
            WHEN mlo.raw->'shipping'->>'logistic_type' = 'cross_docking' THEN 'cross_docking'
            ELSE 'self_service'
          END as fulfillment_channel,
          COALESCE(mlo.channel, '') as sales_channel,
          mlo.last_updated as updated_at,
          -- Order items as JSON aggregation
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'sku', mloi.seller_sku,
                'asin', mloi.item_id,
                'title', COALESCE(mloi.title, 'Unknown Product'),
                'quantity', COALESCE(mloi.quantity, 0),
                'unitPrice', COALESCE(mloi.unit_price::numeric, 0),
                'totalPrice', COALESCE((mloi.unit_price::numeric * mloi.quantity), 0),
                'fullUnitPrice', COALESCE(mloi.full_unit_price::numeric, 0),
                'saleFee', COALESCE(mloi.sale_fee::numeric, 0),
                'categoryId', mloi.category_id,
                'variationId', mloi.variation_id,
                'listingTypeId', mloi.listing_type_id
              )
              ORDER BY mloi.id
            ) FILTER (WHERE mloi.id IS NOT NULL), 
            '[]'::json
          ) as items
        FROM ml_orders mlo
        LEFT JOIN ml_order_items mloi ON mlo.ml_order_id = mloi.ml_order_id
        ${mlWhere}
        GROUP BY 
          mlo.site_id,
          mlo.ml_order_id,
          mlo.date_created,
          mlo.status,
          mlo.total_amount,
          mlo.currency_id,
          mlo.buyer_id,
          mlo.channel,
          mlo.last_updated,
          mlo.raw
      `;
    }

    // Build combined query
    const queries = [];
    if (amazonQuery) queries.push(amazonQuery);
    if (mlQuery) queries.push(mlQuery);

    if (queries.length === 0) {
      return res.status(400).json({ error: 'Invalid channel parameter' });
    }

    let combinedQuery = `
      WITH unified_orders AS (
        ${queries.join(' UNION ALL ')}
      )
      SELECT *
      FROM unified_orders uo
      ORDER BY uo.purchase_date DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;
    params.push(pageSize, offset);

    logger.info('Executing unified orders query', { 
      query: combinedQuery.substring(0, 500) + '...', 
      params: params.slice(0, 5) 
    });

    const result = await pool.query(combinedQuery, params);

    // Count query for pagination - build separate count queries with same filters
    const countQueries = [];
    const countParams: any[] = [];
    let countParamIndex = 1;

    if (channel === 'all' || channel === 'amazon') {
      let amazonCountWhere = 'WHERE 1=1';
      
      if (startDate) {
        amazonCountWhere += ` AND o.purchase_date >= $${countParamIndex}`;
        countParams.push(startDate);
        countParamIndex++;
      }
      
      if (endDate) {
        amazonCountWhere += ` AND o.purchase_date <= $${countParamIndex}`;
        countParams.push(endDate);
        countParamIndex++;
      }
      
      if (status) {
        amazonCountWhere += ` AND o.order_status = $${countParamIndex}`;
        countParams.push(status);
        countParamIndex++;
      }
      
      if (search) {
        amazonCountWhere += ` AND (
          o.amazon_order_id ILIKE $${countParamIndex} OR 
          o.buyer_name ILIKE $${countParamIndex} OR 
          o.buyer_email ILIKE $${countParamIndex}
        )`;
        countParams.push(`%${search}%`);
        countParamIndex++;
      }
      
      countQueries.push(`
        SELECT COUNT(DISTINCT o.amazon_order_id) as total
        FROM orders o
        LEFT JOIN order_items oi ON o.amazon_order_id = oi.amazon_order_id
        ${amazonCountWhere}
      `);
    }

    if (channel === 'all' || channel === 'mercadolivre') {
      let mlCountWhere = 'WHERE 1=1';
      
      if (startDate) {
        mlCountWhere += ` AND mlo.date_created >= $${countParamIndex}`;
        countParams.push(startDate);
        countParamIndex++;
      }
      
      if (endDate) {
        mlCountWhere += ` AND mlo.date_created <= $${countParamIndex}`;
        countParams.push(endDate);
        countParamIndex++;
      }
      
      if (status) {
        mlCountWhere += ` AND mlo.status = $${countParamIndex}`;
        countParams.push(status);
        countParamIndex++;
      }
      
      if (search) {
        mlCountWhere += ` AND (
          mlo.ml_order_id::text ILIKE $${countParamIndex} OR
          mlo.buyer_id::text ILIKE $${countParamIndex}
        )`;
        countParams.push(`%${search}%`);
        countParamIndex++;
      }
      
      countQueries.push(`
        SELECT COUNT(DISTINCT mlo.ml_order_id) as total
        FROM ml_orders mlo
        LEFT JOIN ml_order_items mloi ON mlo.ml_order_id = mloi.ml_order_id
        ${mlCountWhere}
      `);
    }

    const finalCountQuery = `
      WITH unified_counts AS (
        ${countQueries.join(' UNION ALL ')}
      )
      SELECT SUM(total) as total FROM unified_counts
    `;

    const countResult = await pool.query(finalCountQuery, countParams);
    const totalItems = parseInt(countResult.rows[0]?.total || '0', 10);
    const totalPages = Math.ceil(totalItems / pageSize);

    // Transform results to standardized format with address fields
    const orders = result.rows.map((row: any) => ({
      orderId: row.order_id,
      marketplace: row.marketplace,
      marketplaceCode: row.marketplace_code,
      purchaseDate: row.purchase_date,
      customer: {
        name: row.customer_name || 'Unknown',
        email: row.customer_email || '',
        id: row.customer_id || '',
        phone: row.customer_phone || ''
      },
      shippingAddress: {
        city: row.shipping_city || '',
        state: row.shipping_state || '',
        postalCode: row.shipping_postal || '',
        country: row.shipping_country || ''
      },
      orderStatus: row.order_status,
      orderTotal: parseFloat(row.order_total || '0'),
      currency: row.currency || (row.marketplace === 'mercadolivre' ? 'BRL' : 'USD'),
      isPrime: row.is_prime || false,
      fulfillmentChannel: row.fulfillment_channel || '',
      salesChannel: row.sales_channel || '',
      updatedAt: row.updated_at,
      items: Array.isArray(row.items) ? row.items.map((item: any) => ({
        sku: item.sku || '',
        asin: item.asin || '',
        title: item.title || 'Unknown Product',
        quantity: parseInt(item.quantity || '0', 10),
        unitPrice: parseFloat(item.unitPrice || '0'),
        totalPrice: parseFloat(item.totalPrice || '0'),
        // Amazon specific fields
        ...(row.marketplace === 'amazon' && {
          itemTax: parseFloat(item.itemTax || '0'),
          promotionDiscount: parseFloat(item.promotionDiscount || '0'),
          conditionId: item.conditionId || '',
          isGift: item.isGift || false
        }),
        // MercadoLibre specific fields
        ...(row.marketplace === 'mercadolivre' && {
          fullUnitPrice: parseFloat(item.fullUnitPrice || '0'),
          saleFee: parseFloat(item.saleFee || '0'),
          categoryId: item.categoryId || '',
          variationId: item.variationId || '',
          listingTypeId: item.listingTypeId || ''
        })
      })) : []
    }));

    return res.json({
      orders,
      pagination: {
        page: pageNum,
        limit: pageSize,
        total: totalItems,
        totalPages
      },
      filters: {
        channel,
        startDate: startDate || null,
        endDate: endDate || null,
        status: status || null,
        search: search || null
      }
    });

  } catch (error) {
    logger.error('Error fetching unified detailed orders:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch unified detailed orders',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/orders-detailed/summary - unified summary for both marketplaces
router.get('/summary', clerkAuth, async (req, res) => {
  try {
    const { period = '30d', channel = 'all' } = req.query as Record<string, string>;

    const now = new Date();
    
    const summaryParams: any[] = [];
    let summaryDateFilter = '';
    let summaryParamIndex = 1;
    
    switch (period) {
      case '7d':
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        summaryDateFilter = `AND purchase_date >= $${summaryParamIndex++}`;
        summaryParams.push(sevenDaysAgo.toISOString());
        break;
      case '30d':
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        summaryDateFilter = `AND purchase_date >= $${summaryParamIndex++}`;
        summaryParams.push(thirtyDaysAgo.toISOString());
        break;
      case '90d':
        const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        summaryDateFilter = `AND purchase_date >= $${summaryParamIndex++}`;
        summaryParams.push(ninetyDaysAgo.toISOString());
        break;
      case 'all':
      default:
        summaryDateFilter = '';
        break;
    }

    const queries = [];

    // Amazon summary
    if (channel === 'all' || channel === 'amazon') {
      queries.push(`
        SELECT 
          'amazon' as marketplace,
          COUNT(*) as order_count,
          COALESCE(SUM(order_total_amount::numeric), 0) as total_revenue,
          COALESCE(AVG(order_total_amount::numeric), 0) as avg_order_value
        FROM orders 
        WHERE 1=1 ${summaryDateFilter}
      `);
    }

    // MercadoLibre summary
    if (channel === 'all' || channel === 'mercadolivre') {
      queries.push(`
        SELECT 
          'mercadolivre' as marketplace,
          COUNT(*) as order_count,
          COALESCE(SUM(total_amount::numeric), 0) as total_revenue,
          COALESCE(AVG(total_amount::numeric), 0) as avg_order_value
        FROM ml_orders 
        WHERE 1=1 ${summaryDateFilter.replace('purchase_date', 'date_created')}
      `);
    }

    if (queries.length === 0) {
      return res.status(400).json({ error: 'Invalid channel parameter' });
    }

    const summaryQuery = queries.join(' UNION ALL ');
    const result = await pool.query(summaryQuery, summaryParams);

    // Calculate totals
    const summary = {
      totalOrders: 0,
      totalRevenue: 0,
      avgOrderValue: 0,
      marketplaceBreakdown: [] as any[]
    };

    result.rows.forEach((row: any) => {
      const orderCount = parseInt(row.order_count || '0', 10);
      const totalRevenue = parseFloat(row.total_revenue || '0');
      const avgOrderValue = parseFloat(row.avg_order_value || '0');

      summary.totalOrders += orderCount;
      summary.totalRevenue += totalRevenue;
      summary.marketplaceBreakdown.push({
        marketplace: row.marketplace,
        orderCount,
        totalRevenue,
        avgOrderValue
      });
    });

    summary.avgOrderValue = summary.totalOrders > 0 ? summary.totalRevenue / summary.totalOrders : 0;

    return res.json({
      summary,
      period,
      channel
    });

  } catch (error) {
    logger.error('Error fetching unified orders summary:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch unified orders summary',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export const ordersDetailedRouter = router;