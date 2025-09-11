import express from 'express';
import { pool } from '../config/database';
import { requireApiKey, optionalApiKey } from '../middleware/apiKey.middleware';
import { logger } from '../utils/logger';
import { imageValidator } from '../services/image-validator.service';

const router = express.Router();

// Get all products with pagination
router.get('/', optionalApiKey, async (req, res) => {
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
        COALESCE(SUM(COALESCE(oi.price_amount, oi.item_price::numeric)), 0) as total_revenue
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
        image_url: product.image_url ? (product.image_url.startsWith('http://') ? product.image_url.replace('http://', 'https://') : product.image_url) : null,
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

// Get distinct brands (for filters)
router.get('/brands', optionalApiKey, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        LOWER(TRIM(brand)) as value,
        TRIM(brand) as label,
        COUNT(*)::int as count
      FROM products
      WHERE brand IS NOT NULL AND TRIM(brand) <> ''
      GROUP BY TRIM(brand)
      ORDER BY COUNT(*) DESC, TRIM(brand) ASC
      LIMIT 250
    `);

    return res.json({
      success: true,
      brands: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    logger.error('Error fetching brands list:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch brands',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get top performing products
router.get('/top', optionalApiKey, async (req, res) => {
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
        image_url: product.image_url ? (product.image_url.startsWith('http://') ? product.image_url.replace('http://', 'https://') : product.image_url) : null,
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
router.get('/:asin', optionalApiKey, async (req, res) => {
  try {
    const { asin } = req.params;

    const result = await pool.query(`
      SELECT 
        p.*,
        COALESCE(SUM(oi.quantity_ordered), 0) as units_sold,
        COALESCE(SUM(COALESCE(oi.price_amount, oi.item_price::numeric)), 0) as total_revenue,
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
        image_url: product.image_url ? (product.image_url.startsWith('http://') ? product.image_url.replace('http://', 'https://') : product.image_url) : null,
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
        updatedAt: product.updated_at,
        costs: {
          compra: product.compra !== null ? Number(product.compra) : null,
          armazenagem: product.armazenagem !== null ? Number(product.armazenagem) : null,
          frete_amazon: product.frete_amazon !== null ? Number(product.frete_amazon) : null,
          custos_percentuais: product.custos_percentuais !== null ? Number(product.custos_percentuais) : null,
          imposto_percent: product.imposto_percent !== null ? Number(product.imposto_percent) : null,
          custo_variavel_percent: product.custo_variavel_percent !== null ? Number(product.custo_variavel_percent) : null,
          margem_contribuicao_percent: product.margem_contribuicao_percent !== null ? Number(product.margem_contribuicao_percent) : null,
          custos_manuais: product.custos_manuais === true
        }
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
router.put('/:asin', requireApiKey, async (req, res) => {
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
        image_url: product.image_url ? (product.image_url.startsWith('http://') ? product.image_url.replace('http://', 'https://') : product.image_url) : null,
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

// Validate and fix product images
// TEMP: No auth for debugging
router.post('/validate-images', requireApiKey, async (_req, res) => {
  try {
    logger.info('Manual image validation triggered');
    const result = await imageValidator.validateAndFixAll();
    
    if (result.success) {
      return res.json({
        success: true,
        message: 'Image validation completed',
        results: {
          checked: result.checked,
          valid: result.valid,
          fixed: result.fixed,
          stillProblematic: result.stillProblematic
        }
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Image validation failed',
        error: 'Validation process encountered an error'
      });
    }
  } catch (error) {
    logger.error('Image validation endpoint error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to run image validation',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Validate single product image
router.post('/validate-image/:asin', requireApiKey, async (req, res) => {
  try {
    const { asin } = req.params;
    logger.info(`Single image validation triggered for ${asin}`);
    
    const isValid = await imageValidator.validateSingleProduct(asin);
    
    return res.json({
      success: true,
      asin,
      isValid,
      message: isValid ? 'Image is valid' : 'Image was invalid and has been fixed'
    });
  } catch (error) {
    logger.error(`Image validation error for ${req.params.asin}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to validate image',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Update manual cost fields for a product (ASIN)
 * Only allows the following fields to be updated (per rule):
 * - Custos Manuais (custos_manuais: boolean)
 * - Compra (R$) (compra: numeric)
 * - Armazenagem (R$) (armazenagem: numeric)
 * - Frete pra Amazon (R$) (frete_amazon: numeric)
 * - Custos Percentuais (% sobre Receita) (custos_percentuais: numeric)
 * - Imposto (%) (imposto_percent: numeric)
 * - Custo Variável (%) (custo_variavel_percent: numeric)
 * - Margem de Contribuição (%) (margem_contribuicao_percent: numeric)
 */
router.put('/:asin/costs', requireApiKey, async (req, res) => {
  const { asin } = req.params;

  // Accept snake_case and camelCase keys -> map to DB columns
  const keyMap: Record<string, string> = {
    custos_manuais: 'custos_manuais',
    custosManuais: 'custos_manuais',

    compra: 'compra',

    armazenagem: 'armazenagem',

    freteAmazon: 'frete_amazon',
    frete_amazon: 'frete_amazon',

    custosPercentuais: 'custos_percentuais',
    custos_percentuais: 'custos_percentuais',

    imposto: 'imposto_percent',
    imposto_percent: 'imposto_percent',

    custoVariavel: 'custo_variavel_percent',
    custo_variavel: 'custo_variavel_percent',
    custo_variavel_percent: 'custo_variavel_percent',

    margemContribuicao: 'margem_contribuicao_percent',
    margem_contribuicao_percent: 'margem_contribuicao_percent',
  };

  // Filter payload to allowed keys only
  const payload = req.body || {};
  const allowedEntries: Array<[string, any]> = Object.entries(payload)
    .map(([k, v]) => [keyMap[k] || '', v] as [string, any])
    .filter(([k]) => Boolean(k));

  if (allowedEntries.length === 0) {
    return res.status(400).json({
      error: 'No valid cost fields provided',
      allowed: Object.values(keyMap).filter((v, i, a) => a.indexOf(v) === i),
    });
  }

  // Prepare validations and coercions
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

  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Ensure columns exist (idempotent)
      const ddl = `
        ALTER TABLE products
          ADD COLUMN IF NOT EXISTS custos_manuais boolean,
          ADD COLUMN IF NOT EXISTS compra numeric,
          ADD COLUMN IF NOT EXISTS armazenagem numeric,
          ADD COLUMN IF NOT EXISTS frete_amazon numeric,
          ADD COLUMN IF NOT EXISTS custos_percentuais numeric,
          ADD COLUMN IF NOT EXISTS imposto_percent numeric,
          ADD COLUMN IF NOT EXISTS custo_variavel_percent numeric,
          ADD COLUMN IF NOT EXISTS margem_contribuicao_percent numeric;
      `;
      await client.query(ddl);

      // Build dynamic update set from allowed entries
      for (const [col, rawVal] of allowedEntries) {
        if (col === 'custos_manuais') {
          const boolVal = typeof rawVal === 'boolean' ? rawVal : String(rawVal).toLowerCase() === 'true';
          updates.push(`${col} = $${paramIndex++}`);
          values.push(boolVal);
          continue;
        }

        if (numericFields.has(col)) {
          const num = Number(rawVal);
          if (Number.isNaN(num)) {
            throw new Error(`Field ${col} must be a number`);
          }
          if (percentFields.has(col) && (num < 0 || num > 100)) {
            throw new Error(`Field ${col} must be between 0 and 100`);
          }
          updates.push(`${col} = $${paramIndex++}`);
          values.push(num);
        }
      }

      if (updates.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'No valid updates to apply' });
      }

      updates.push(`updated_at = NOW()`);
      values.push(asin);

      const updateSql = `
        UPDATE products
        SET ${updates.join(', ')}
        WHERE asin = $${paramIndex}
        RETURNING asin, sku,
          compra, armazenagem, frete_amazon, custos_percentuais,
          imposto_percent, custo_variavel_percent, margem_contribuicao_percent,
          custos_manuais, updated_at
      `;

      const result = await client.query(updateSql, values);
      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Product not found for provided ASIN' });
      }

      await client.query('COMMIT');
      return res.json({
        message: 'Costs updated successfully',
        asin,
        costs: result.rows[0],
      });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('Failed to update product costs:', err);
      return res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to update costs',
      });
    } finally {
      client.release();
    }
  } catch (connErr) {
    logger.error('Database error (costs update):', connErr);
    return res.status(500).json({ error: 'Database connection error' });
  }
});

export const productsRouter = router;
