import express from 'express';
import { pool } from '../config/database';
import authMiddleware from '../middleware/auth.middleware';
import { logger } from '../utils/logger';

const router = express.Router();

// Get all products with pagination
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', sort = 'title', order = 'asc' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    let query = `
      SELECT 
        p.asin,
        p.sku,
        p.title,
        p.description,
        p.category,
        p.brand,
        p.image_url,
        p.price,
        p.currency_code,
        p.in_stock,
        p.inventory_quantity,
        p.seller_name,
        p.seller_count,
        p.buy_box_seller,
        p.cogs,
        p.updated_at,
        COALESCE(SUM(oi.quantity_ordered), 0) as units_sold,
        COALESCE(SUM(oi.item_price::numeric * oi.quantity_ordered), 0) as total_revenue
      FROM products p
      LEFT JOIN order_items oi ON p.asin = oi.asin
    `;

    const params: any[] = [];
    
    if (search) {
      query += ` WHERE (p.title ILIKE $1 OR p.asin ILIKE $1 OR p.sku ILIKE $1)`;
      params.push(`%${search}%`);
    }

    query += ` GROUP BY p.asin, p.sku, p.title, p.description, p.category, p.brand, 
               p.image_url, p.price, p.currency_code, p.in_stock, p.inventory_quantity,
               p.seller_name, p.seller_count, p.buy_box_seller, p.cogs, p.updated_at`;

    // Add sorting
    const validSortColumns = ['title', 'price', 'units_sold', 'total_revenue', 'inventory_quantity'];
    const sortColumn = validSortColumns.includes(sort as string) ? sort : 'title';
    const sortOrder = order === 'desc' ? 'DESC' : 'ASC';
    query += ` ORDER BY ${sortColumn} ${sortOrder}`;

    // Add pagination
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit as string), offset);

    const result = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = `SELECT COUNT(DISTINCT asin) as total FROM products`;
    const countParams: any[] = [];
    
    if (search) {
      countQuery += ` WHERE (title ILIKE $1 OR asin ILIKE $1 OR sku ILIKE $1)`;
      countParams.push(`%${search}%`);
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const totalItems = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalItems / parseInt(limit as string));

    return res.json({
      products: result.rows.map(product => ({
        asin: product.asin,
        sku: product.sku,
        title: product.title,
        description: product.description,
        category: product.category,
        brand: product.brand,
        imageUrl: product.image_url,
        price: parseFloat(product.price || 0),
        currencyCode: product.currency_code,
        inStock: product.in_stock,
        inventoryQuantity: parseInt(product.inventory_quantity || 0),
        sellerName: product.seller_name || product.buy_box_seller || 'Unknown Seller',
        sellerCount: parseInt(product.seller_count || 1),
        buyBoxSeller: product.buy_box_seller,
        cogs: parseFloat(product.cogs || 0),
        unitsSold: parseInt(product.units_sold),
        totalRevenue: parseFloat(product.total_revenue),
        updatedAt: product.updated_at
      })),
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total: totalItems,
        totalPages
      }
    });
  } catch (error) {
    logger.error('Error fetching products:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch products',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get top performing products
router.get('/top', authMiddleware, async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const result = await pool.query(`
      SELECT 
        p.asin,
        p.sku,
        p.title,
        p.image_url,
        p.price,
        p.in_stock,
        p.inventory_quantity,
        p.seller_name,
        p.buy_box_seller,
        COUNT(DISTINCT oi.amazon_order_id) as order_count,
        COALESCE(SUM(oi.quantity_ordered), 0) as units_sold,
        COALESCE(SUM(oi.item_price::numeric * oi.quantity_ordered), 0) as revenue
      FROM products p
      LEFT JOIN order_items oi ON p.asin = oi.asin
      WHERE oi.amazon_order_id IS NOT NULL
      GROUP BY p.asin, p.sku, p.title, p.image_url, p.price, p.in_stock, 
               p.inventory_quantity, p.seller_name, p.buy_box_seller
      ORDER BY revenue DESC
      LIMIT $1
    `, [parseInt(limit as string)]);

    return res.json({
      products: result.rows.map(product => ({
        asin: product.asin,
        sku: product.sku,
        title: product.title,
        imageUrl: product.image_url,
        price: parseFloat(product.price || 0),
        inStock: product.in_stock,
        inventoryQuantity: parseInt(product.inventory_quantity || 0),
        sellerName: product.seller_name || product.buy_box_seller || 'Unknown Seller',
        buyBoxSeller: product.buy_box_seller,
        orderCount: parseInt(product.order_count),
        unitsSold: parseInt(product.units_sold),
        revenue: parseFloat(product.revenue)
      }))
    });
  } catch (error) {
    logger.error('Error fetching top products:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch top products',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get single product details
router.get('/:asin', authMiddleware, async (req, res) => {
  try {
    const { asin } = req.params;

    const result = await pool.query(`
      SELECT 
        p.*,
        COALESCE(SUM(oi.quantity_ordered), 0) as units_sold,
        COALESCE(SUM(oi.item_price::numeric * oi.quantity_ordered), 0) as total_revenue,
        COUNT(DISTINCT oi.amazon_order_id) as order_count
      FROM products p
      LEFT JOIN order_items oi ON p.asin = oi.asin
      WHERE p.asin = $1
      GROUP BY p.asin
    `, [asin]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = result.rows[0];

    // Get recent orders for this product
    const recentOrders = await pool.query(`
      SELECT 
        o.amazon_order_id,
        o.purchase_date,
        oi.quantity_ordered,
        oi.item_price,
        o.buyer_name
      FROM order_items oi
      JOIN orders o ON oi.amazon_order_id = o.amazon_order_id
      WHERE oi.asin = $1
      ORDER BY o.purchase_date DESC
      LIMIT 10
    `, [asin]);

    return res.json({
      product: {
        asin: product.asin,
        sku: product.sku,
        title: product.title,
        description: product.description,
        category: product.category,
        brand: product.brand,
        imageUrl: product.image_url,
        price: parseFloat(product.price || 0),
        currencyCode: product.currency_code,
        inStock: product.in_stock,
        inventoryQuantity: parseInt(product.inventory_quantity || 0),
        sellerName: product.seller_name || product.buy_box_seller || 'Unknown Seller',
        sellerCount: parseInt(product.seller_count || 1),
        buyBoxSeller: product.buy_box_seller,
        cogs: parseFloat(product.cogs || 0),
        unitsSold: parseInt(product.units_sold),
        totalRevenue: parseFloat(product.total_revenue),
        orderCount: parseInt(product.order_count),
        updatedAt: product.updated_at
      },
      recentOrders: recentOrders.rows.map(order => ({
        orderId: order.amazon_order_id,
        date: order.purchase_date,
        quantity: parseInt(order.quantity_ordered),
        price: parseFloat(order.item_price || 0),
        customer: order.buyer_name || 'Anonymous'
      }))
    });
  } catch (error) {
    logger.error('Error fetching product details:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch product details',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update product details
router.put('/:asin', authMiddleware, async (req, res) => {
  try {
    const { asin } = req.params;
    const { 
      sku, 
      title, 
      description, 
      category, 
      brand, 
      price, 
      inventoryQuantity,
      sellerName,
      buyBoxSeller,
      cogs
    } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (sku !== undefined) {
      updates.push(`sku = $${paramIndex++}`);
      values.push(sku);
    }
    if (title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(title);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      values.push(category);
    }
    if (brand !== undefined) {
      updates.push(`brand = $${paramIndex++}`);
      values.push(brand);
    }
    if (price !== undefined) {
      updates.push(`price = $${paramIndex++}`);
      values.push(price);
    }
    if (inventoryQuantity !== undefined) {
      updates.push(`inventory_quantity = $${paramIndex++}`);
      values.push(inventoryQuantity);
      updates.push(`in_stock = $${paramIndex++}`);
      values.push(inventoryQuantity > 0);
    }
    if (sellerName !== undefined) {
      updates.push(`seller_name = $${paramIndex++}`);
      values.push(sellerName);
    }
    if (buyBoxSeller !== undefined) {
      updates.push(`buy_box_seller = $${paramIndex++}`);
      values.push(buyBoxSeller);
    }
    if (cogs !== undefined) {
      updates.push(`cogs = $${paramIndex++}`);
      values.push(cogs);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(asin);

    const query = `
      UPDATE products 
      SET ${updates.join(', ')}
      WHERE asin = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = result.rows[0];

    return res.json({
      message: 'Product updated successfully',
      product: {
        asin: product.asin,
        sku: product.sku,
        title: product.title,
        description: product.description,
        category: product.category,
        brand: product.brand,
        imageUrl: product.image_url,
        price: parseFloat(product.price || 0),
        currencyCode: product.currency_code,
        inStock: product.in_stock,
        inventoryQuantity: parseInt(product.inventory_quantity || 0),
        sellerName: product.seller_name,
        sellerCount: parseInt(product.seller_count || 1),
        buyBoxSeller: product.buy_box_seller,
        cogs: parseFloat(product.cogs || 0),
        updatedAt: product.updated_at
      }
    });
  } catch (error) {
    logger.error('Error updating product:', error);
    return res.status(500).json({ 
      error: 'Failed to update product',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export const productsRouter = router;