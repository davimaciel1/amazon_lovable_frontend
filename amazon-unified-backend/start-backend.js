/**
 * Quick backend starter that bypasses TypeScript compilation issues
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { Client } = require('pg');
const cookieParser = require('cookie-parser');
const { ClerkExpressRequireAuth } = require('@clerk/express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8086; // Use 8086 for AI query generator

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: ['http://localhost:8083', 'http://localhost:8084', 'http://localhost:8085', 'http://localhost:8086'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Basic auth test endpoint
app.get('/auth', (req, res) => {
  res.json({ 
    message: 'Auth endpoint working',
    clerkEnabled: !!process.env.CLERK_PUBLISHABLE_KEY
  });
});

// Sales routes - simplified version
app.get('/api/sales/summary', async (req, res) => {
  try {
    // Mock data for now - replace with actual database queries
    res.json({
      totalSales: 45678.90,
      ordersCount: 234,
      averageOrderValue: 195.21,
      topProducts: [
        { name: 'Product A', sales: 12345.67, units: 89 },
        { name: 'Product B', sales: 8901.23, units: 56 }
      ],
      recentOrders: [
        { 
          id: 'AMZ-001', 
          date: new Date().toISOString(), 
          total: 234.56,
          status: 'Shipped'
        }
      ]
    });
  } catch (error) {
    console.error('Error fetching sales summary:', error);
    res.status(500).json({ error: 'Failed to fetch sales summary' });
  }
});

// Products endpoint
app.get('/api/products', async (req, res) => {
  try {
    res.json({
      products: [
        { 
          asin: 'B00TEST001',
          title: 'Test Product 1',
          price: 29.99,
          inventory: 100,
          sales_rank: 1234
        },
        { 
          asin: 'B00TEST002',
          title: 'Test Product 2',
          price: 49.99,
          inventory: 50,
          sales_rank: 5678
        }
      ],
      total: 2
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Orders endpoint
app.get('/api/orders', async (req, res) => {
  try {
    res.json({
      orders: [
        {
          amazon_order_id: 'AMZ-123456',
          purchase_date: new Date().toISOString(),
          order_status: 'Shipped',
          order_total_amount: 99.99,
          buyer_name: 'John Doe'
        }
      ],
      total: 1
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// AI Query routes
const aiQueryRoutes = require('./src/routes/ai-query.routes');
app.use('/api/ai-query', aiQueryRoutes);

// Product images endpoint
app.get('/api/product-images/:filename', (req, res) => {
  const filename = req.params.filename;
  const imagePath = path.join(__dirname, 'public', 'product-images', filename);
  
  res.sendFile(imagePath, (err) => {
    if (err) {
      console.log(`Image not found: ${filename}`);
      // Send a default placeholder image or 404
      res.status(404).json({ error: 'Image not found' });
    }
  });
});

// Image proxy endpoint to bypass CORS for external images (e.g., Amazon)
app.get('/api/image-proxy', async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) {
    return res.status(400).send('Image URL is required');
  }
  try {
    const https = require('https');
    const http = require('http');
    const url = require('url');

    const parsedUrl = url.parse(imageUrl);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.path,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.amazon.com/',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    };

    protocol.get(options, (imgRes) => {
      if (imgRes.statusCode === 301 || imgRes.statusCode === 302) {
        const redirectUrl = imgRes.headers.location;
        if (redirectUrl) {
          req.query.url = redirectUrl;
          return app._router.handle(req, res);
        }
      }

      if (imgRes.statusCode !== 200) {
        console.error(`Image fetch failed with status: ${imgRes.statusCode}`);
        return res.status(imgRes.statusCode).send('Image not found');
      }

      const contentType = imgRes.headers['content-type'] || 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Access-Control-Allow-Origin', '*');

      if (imgRes.headers['content-encoding']) {
        res.setHeader('Content-Encoding', imgRes.headers['content-encoding']);
      }

      imgRes.pipe(res);
    }).on('error', (err) => {
      console.error('Error fetching image:', err);
      res.status(500).send('Error fetching image');
    });
  } catch (error) {
    console.error('Error in image proxy:', error);
    res.status(500).send('Error processing image request');
  }
});

// Sales simple endpoint for frontend
app.get('/api/sales-simple', async (req, res) => {
  const { page = 1, limit = 50, startDate, endDate, sortBy = 'revenue', sortDir = 'asc', countries, orderTypes, keyword } = req.query;
  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 50;
  const offset = (pageNum - 1) * limitNum;
  
  const client = new Client({
    host: process.env.DB_HOST || '49.12.191.119',
    port: Number(process.env.DB_PORT || 5456),
    user: process.env.DB_USER || 'saas',
    password: process.env.DB_PASSWORD || 'saas_password_123',
    database: process.env.DB_NAME || 'amazon_monitor'
  });
  
  try {
    await client.connect();
    
    // Ensure product_costs table exists for per-ASIN cost configuration
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_costs (
        id BIGSERIAL PRIMARY KEY,
        asin TEXT UNIQUE NOT NULL,
        sku TEXT,
        compra NUMERIC,
        armazenagem NUMERIC,
        frete_amazon NUMERIC,
        imposto_percent NUMERIC,
        custo_variavel_percent NUMERIC,
        margem_contribuicao_percent NUMERIC,
        amazon_referral_fee_percent NUMERIC,
        acos_percent NUMERIC,
        logistics_per_unit NUMERIC,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Defaults for automatic costs (can be overridden via env)
    const COMMISSION_RATE = Number(process.env.COMMISSION_RATE || 0.15); // 15%
    const ACOS_RATE = Number(process.env.ACOS_RATE || 0.05); // 5%
    const LOGISTICS_PER_UNIT = Number(process.env.LOGISTICS_PER_UNIT || 8.00); // R$ 8,00 por unidade

    // Build ORDER BY clause
    let orderClause = 'ORDER BY revenue DESC';
    if (sortBy && ['revenue', 'units', 'orders', 'price', 'product'].includes(String(sortBy))) {
      const direction = String(sortDir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
      if (sortBy === 'product') {
        orderClause = `ORDER BY product ${direction}`;
      } else {
        orderClause = `ORDER BY ${sortBy} ${direction}`;
      }
    }
    
    // Build filters dynamically (collect params separately)
    const filterParams = [];
    let whereFilters = '';

    // Date range filter
    if (startDate && endDate) {
      const fromIdx = filterParams.length + 1;
      const toIdx = filterParams.length + 2;
      whereFilters += ` AND o."purchaseDate" >= $${fromIdx} AND o."purchaseDate" <= $${toIdx}`;
      filterParams.push(startDate, endDate);
    }

    // Keyword filter (title, SKU, ASIN)
    if (keyword && String(keyword).trim().length > 0) {
      const kIdx = filterParams.length + 1;
      whereFilters += ` AND (oi.title ILIKE $${kIdx} OR oi.seller_sku ILIKE $${kIdx} OR oi.asin ILIKE $${kIdx})`;
      filterParams.push(`%${String(keyword).trim()}%`);
    }

    // Countries -> marketplace filter
    if (countries) {
      const raw = String(countries)
        .split(',')
        .map(s => s.trim().toUpperCase())
        .filter(Boolean);

      const MARKETPLACE_IDS = {
        US: process.env.MARKETPLACE_ID_US || 'ATVPDKIKX0DER',
        CA: process.env.MARKETPLACE_ID_CA || 'A2EUQ1WTGCTBG2',
        MX: process.env.MARKETPLACE_ID_MX || 'A1AM78C64UM0Y8',
        BR: process.env.MARKETPLACE_ID_BR || 'A2Q3Y263D00KWC',
      };
      const ids = raw
        .map(code => MARKETPLACE_IDS[code])
        .filter(Boolean);
      if (ids.length > 0) {
        const arrIdx = filterParams.length + 1;
        whereFilters += ` AND p.marketplace_id = ANY($${arrIdx}::text[])`;
        filterParams.push(ids);
      }
    }

    // Compose final params for data query (...filters, limit, offset)
    const queryParams = [...filterParams, limitNum, offset];
    const limitIdx = filterParams.length + 1;
    const offsetIdx = filterParams.length + 2;
    
    const query = `
      WITH f AS (
        SELECT 
          oi.asin,
          oi.seller_sku,
          MAX(oi.title) AS product,
          SUM(oi.quantity_ordered) AS units,
          SUM(
            CASE 
              WHEN oi.price_amount IS NOT NULL THEN (oi.price_amount)::numeric
              WHEN oi.item_price IS NOT NULL THEN (oi.item_price * oi.quantity_ordered)
              WHEN oi.listing_price IS NOT NULL THEN (oi.listing_price * oi.quantity_ordered)
              WHEN p.price IS NOT NULL THEN (p.price * oi.quantity_ordered)
              ELSE 0
            END
          ) AS revenue,
          COUNT(DISTINCT oi.amazon_order_id) AS orders,
          SUM( COALESCE( (row_to_json(p)->>'cogs')::numeric, 0) * oi.quantity_ordered ) AS cogs_total,
          -- Automatically-collected costs if present on order_items (prefer these over estimates)
          SUM(
            (
              CASE 
                WHEN oi.price_amount IS NOT NULL THEN (oi.price_amount)::numeric
                WHEN oi.item_price IS NOT NULL THEN (oi.item_price * oi.quantity_ordered)
                WHEN oi.listing_price IS NOT NULL THEN (oi.listing_price * oi.quantity_ordered)
                WHEN p.price IS NOT NULL THEN (p.price * oi.quantity_ordered)
                ELSE 0
              END
            ) * (COALESCE((row_to_json(oi)->>'amazon_referral_fee_percent')::numeric, NULL) / 100.0)
          ) AS referral_fee_sum,
          SUM( COALESCE( (row_to_json(oi)->>'amazon_fba_fee')::numeric, 0) * oi.quantity_ordered ) AS fba_fee_sum,
          SUM( COALESCE( (row_to_json(oi)->>'amazon_storage_fee')::numeric, 0) * oi.quantity_ordered ) AS storage_fee_sum,
          SUM( COALESCE( (row_to_json(oi)->>'shipping_cost_to_amazon')::numeric, 0) * oi.quantity_ordered ) AS inbound_shipping_sum,
          0::numeric AS ads_cost_sum,
          SUM( COALESCE(oi.item_tax, (row_to_json(oi)->>'tax_amount')::numeric, 0) ) AS tax_amount_sum
        FROM order_items oi
        LEFT JOIN "Order" o ON oi.amazon_order_id = o."amazonOrderId"
        LEFT JOIN products p ON oi.asin = p.asin
        WHERE oi.asin IS NOT NULL ${whereFilters}
        GROUP BY oi.asin, oi.seller_sku
      )
      SELECT 
        f.seller_sku AS sku,
        f.product,
        f.asin,
        f.units,
        f.revenue,
        f.orders,
        CASE WHEN f.units > 0 THEN f.revenue / NULLIF(f.units, 0) ELSE 0 END AS price,
        -- Rates: commission/acos/logistics are automatic (global), tax/variable from per-ASIN config
        ${COMMISSION_RATE}::numeric AS commission_rate,
        ${ACOS_RATE}::numeric AS acos_rate,
        COALESCE(pc.imposto_percent, 0)::numeric / 100.0 AS tax_rate,
        COALESCE(pc.custo_variavel_percent, 0)::numeric / 100.0 AS variable_rate,
        ${LOGISTICS_PER_UNIT}::numeric AS logistics_per_unit,
        (COALESCE(pc.compra,0) + COALESCE(pc.armazenagem,0) + COALESCE(pc.frete_amazon,0))::numeric AS unit_manual_total,
        -- Prefer automatically collected costs when available
        COALESCE(f.referral_fee_sum, (f.revenue * ${COMMISSION_RATE})) AS commission_cost,
        COALESCE(f.ads_cost_sum, (f.revenue * ${ACOS_RATE})) AS acos_cost,
        COALESCE(f.tax_amount_sum, (f.revenue * (COALESCE(pc.imposto_percent, 0)::numeric / 100.0))) AS tax_cost,
        (f.revenue * (COALESCE(pc.custo_variavel_percent, 0)::numeric / 100.0)) AS variable_cost,
        -- Inbound shipping prefers per-item actuals; fallback to manual pc.frete_amazon per unit; else last-resort global logistics
        COALESCE(f.inbound_shipping_sum, (f.units * COALESCE(pc.frete_amazon, 0)::numeric), 0) AS inbound_shipping_cost,
        COALESCE(f.fba_fee_sum, 0) AS fba_fee_cost,
        COALESCE(f.storage_fee_sum, 0) AS storage_fee_cost,
        CASE WHEN (COALESCE(f.inbound_shipping_sum, 0) = 0 AND COALESCE(f.fba_fee_sum, 0) = 0)
             THEN (f.units * ${LOGISTICS_PER_UNIT}::numeric) ELSE 0 END AS logistics_fallback_cost,
        CASE WHEN pc.asin IS NOT NULL THEN (f.units * (COALESCE(pc.compra,0) + COALESCE(pc.armazenagem,0) + COALESCE(pc.frete_amazon,0)))
             ELSE (f.cogs_total) END AS manual_or_legacy_cogs_cost,
        COALESCE(
          (
            f.revenue 
            - CASE WHEN pc.asin IS NOT NULL THEN (f.units * (COALESCE(pc.compra,0) + COALESCE(pc.armazenagem,0) + COALESCE(pc.frete_amazon,0))) ELSE f.cogs_total END
            - COALESCE(f.inbound_shipping_sum, (f.units * COALESCE(pc.frete_amazon, 0)::numeric), 0)
            - COALESCE(f.fba_fee_sum, 0)
            - COALESCE(f.storage_fee_sum, 0)
            - COALESCE(f.referral_fee_sum, (f.revenue * ${COMMISSION_RATE}))
            - COALESCE(f.ads_cost_sum, (f.revenue * ${ACOS_RATE}))
            - COALESCE(f.tax_amount_sum, (f.revenue * (COALESCE(pc.imposto_percent, 0)::numeric / 100.0)))
            - (f.revenue * (COALESCE(pc.custo_variavel_percent, 0)::numeric / 100.0))
            - (CASE WHEN (COALESCE(f.inbound_shipping_sum,0)=0 AND COALESCE(f.fba_fee_sum,0)=0) THEN (f.units * ${LOGISTICS_PER_UNIT}::numeric) ELSE 0 END)
          ), 0
        ) AS profit,
        CASE WHEN f.revenue > 0 THEN ((
            f.revenue 
            - CASE WHEN pc.asin IS NOT NULL THEN (f.units * (COALESCE(pc.compra,0) + COALESCE(pc.armazenagem,0) + COALESCE(pc.frete_amazon,0))) ELSE f.cogs_total END
            - COALESCE(f.inbound_shipping_sum, (f.units * COALESCE(pc.frete_amazon, 0)::numeric), 0)
            - COALESCE(f.fba_fee_sum, 0)
            - COALESCE(f.storage_fee_sum, 0)
            - COALESCE(f.referral_fee_sum, (f.revenue * ${COMMISSION_RATE}))
            - COALESCE(f.ads_cost_sum, (f.revenue * ${ACOS_RATE}))
            - COALESCE(f.tax_amount_sum, (f.revenue * (COALESCE(pc.imposto_percent, 0)::numeric / 100.0)))
            - (f.revenue * (COALESCE(pc.custo_variavel_percent, 0)::numeric / 100.0))
            - (CASE WHEN (COALESCE(f.inbound_shipping_sum,0)=0 AND COALESCE(f.fba_fee_sum,0)=0) THEN (f.units * ${LOGISTICS_PER_UNIT}::numeric) ELSE 0 END)
          ) / f.revenue) * 100.0 ELSE 0 END AS percentual_lucro,
        (f.revenue * (COALESCE(pc.margem_contribuicao_percent, 0)::numeric / 100.0)) AS margem_contribuicao_valor,
        (f.revenue * (COALESCE(pc.custo_variavel_percent, 0)::numeric / 100.0)) AS custo_variavel_valor,
        COALESCE(oiimg.product_image_url, oiimg.image_url, p.image_url) AS image_url,
        p.brand,
        p.category,
        COALESCE(
          inv.total_quantity,
          inv.fba_available_quantity,
          p.inventory_quantity,
          0
        ) AS stock,
        COALESCE(p.seller_count, 0) AS sellers,
        p.buy_box_seller AS buy_box_winner
      FROM f
      LEFT JOIN products p ON p.asin = f.asin
      LEFT JOIN product_costs pc ON pc.asin = f.asin
      LEFT JOIN LATERAL (
        SELECT oi2.product_image_url, oi2.image_url
        FROM order_items oi2
        WHERE oi2.asin = f.asin
        ORDER BY oi2.created_at DESC NULLS LAST
        LIMIT 1
      ) oiimg ON TRUE
      LEFT JOIN LATERAL (
        SELECT oi3.fba_available_quantity, oi3.total_quantity
        FROM order_items oi3
        WHERE oi3.asin = f.asin
        ORDER BY oi3.inventory_updated_at DESC NULLS LAST, oi3.created_at DESC NULLS LAST
        LIMIT 1
      ) inv ON TRUE
      ${orderClause}
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;
    
    const countQuery = `
      WITH f AS (
        SELECT 
          oi.asin,
          oi.seller_sku
        FROM order_items oi
        LEFT JOIN "Order" o ON oi.amazon_order_id = o."amazonOrderId"
        WHERE oi.asin IS NOT NULL ${whereFilters}
        GROUP BY oi.asin, oi.seller_sku
      )
      SELECT COUNT(*) as total FROM f
    `;
    
    const [salesResult, countResult] = await Promise.all([
      client.query(query, queryParams),
      client.query(countQuery, filterParams) // Only filters for count
    ]);
    
    // Process results
      const processedData = salesResult.rows.map(row => ({
        ...row,
        image_url: row.image_url && row.image_url.startsWith('http') 
          ? row.image_url 
          : `/api/product-images/${row.asin}.jpg`,
        revenue: parseFloat(row.revenue) || 0,
        price: parseFloat(row.price) || 0,
        commission_rate: parseFloat(row.commission_rate) || 0,
        acos_rate: parseFloat(row.acos_rate) || 0,
        tax_rate: parseFloat(row.tax_rate) || 0,
        variable_rate: parseFloat(row.variable_rate) || 0,
        logistics_per_unit: parseFloat(row.logistics_per_unit) || 0,
        unit_manual_total: parseFloat(row.unit_manual_total) || 0,
        commission_cost: parseFloat(row.commission_cost) || 0,
        acos_cost: parseFloat(row.acos_cost) || 0,
        tax_cost: parseFloat(row.tax_cost) || 0,
        variable_cost: parseFloat(row.variable_cost) || 0,
        inbound_shipping_cost: parseFloat(row.inbound_shipping_cost) || 0,
        fba_fee_cost: parseFloat(row.fba_fee_cost) || 0,
        storage_fee_cost: parseFloat(row.storage_fee_cost) || 0,
        logistics_fallback_cost: parseFloat(row.logistics_fallback_cost) || 0,
        manual_or_legacy_cogs_cost: parseFloat(row.manual_or_legacy_cogs_cost) || 0,
        percentual_lucro: parseFloat(row.percentual_lucro) || 0,
        margem_contribuicao_valor: parseFloat(row.margem_contribuicao_valor) || 0,
        custo_variavel_valor: parseFloat(row.custo_variavel_valor) || 0,
        profit: row.profit !== null && row.profit !== undefined ? Number(row.profit) : (parseFloat(row.revenue) || 0),
        units: parseInt(row.units) || 0,
        orders: parseInt(row.orders) || 0,
        stock: Number(row.stock) || 0,
        sellers: Number(row.sellers) || 0
      }));
    
    res.json({
      success: true,
      data: processedData,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(countResult.rows[0].total / limitNum)
      }
    });
  } catch (error) {
    console.error('Sales simple query error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
});

// Minimal endpoints to set/get COGS per ASIN on products table
app.put('/api/products/:asin/cogs', async (req, res) => {
  const { asin } = req.params;
  let { cogs } = req.body || {};
  const value = Number(cogs);
  if (!isFinite(value) || value < 0) {
    return res.status(400).json({ error: 'Invalid cogs value. Provide a non-negative number.' });
  }

  const client = new Client({
    host: process.env.DB_HOST || '49.12.191.119',
    port: Number(process.env.DB_PORT || 5456),
    user: process.env.DB_USER || 'saas',
    password: process.env.DB_PASSWORD || 'saas_password_123',
    database: process.env.DB_NAME || 'amazon_monitor'
  });

  try {
    await client.connect();
    // Ensure column exists
    await client.query('ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS cogs numeric');
    const result = await client.query(
      'UPDATE products SET cogs = $1, updated_at = NOW() WHERE asin = $2 RETURNING asin, cogs',
      [value, asin]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Product not found for provided ASIN' });
    }
    return res.json({ success: true, product: result.rows[0] });
  } catch (error) {
    console.error('Error updating product cogs:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
});


// Upsert full per-ASIN costs
app.put('/api/products/:asin/costs', async (req, res) => {
  const { asin } = req.params;
  const body = req.body || {};

  const fields = {
    sku: body.sku,
    compra: body.compra,
    armazenagem: body.armazenagem,
    frete_amazon: body.frete_amazon,
    imposto_percent: body.imposto_percent ?? body.imposto,
    custo_variavel_percent: body.custo_variavel_percent,
    margem_contribuicao_percent: body.margem_contribuicao_percent,
  };

  // Validate numbers if provided (except sku which is text)
  for (const [k, v] of Object.entries(fields)) {
    if (k === 'sku') continue;
    if (v !== undefined && v !== null && !isFinite(Number(v))) {
      return res.status(400).json({ error: `Invalid numeric value for ${k}` });
    }
  }

  const client = new Client({
    host: process.env.DB_HOST || '49.12.191.119',
    port: Number(process.env.DB_PORT || 5456),
    user: process.env.DB_USER || 'saas',
    password: process.env.DB_PASSWORD || 'saas_password_123',
    database: process.env.DB_NAME || 'amazon_monitor'
  });

  try {
    await client.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_costs (
        id BIGSERIAL PRIMARY KEY,
        asin TEXT UNIQUE NOT NULL,
        sku TEXT,
        compra NUMERIC,
        armazenagem NUMERIC,
        frete_amazon NUMERIC,
        imposto_percent NUMERIC,
        custo_variavel_percent NUMERIC,
        margem_contribuicao_percent NUMERIC,
        amazon_referral_fee_percent NUMERIC,
        acos_percent NUMERIC,
        logistics_per_unit NUMERIC,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    const cols = ['asin'];
    const placeholders = ['$1'];
    const values = [asin];

    const updates = [];
    let idx = 2;
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined && v !== null) {
        cols.push(k);
        placeholders.push(`$${idx}`);
        if (k === 'sku') {
          values.push(String(v));
        } else {
          values.push(Number(v));
        }
        updates.push(`${k} = EXCLUDED.${k}`);
        idx++;
      }
    }

    const sql = `
      INSERT INTO product_costs (${cols.join(',')})
      VALUES (${placeholders.join(',')})
      ON CONFLICT (asin) DO UPDATE SET
        ${updates.length > 0 ? updates.join(',') + ',' : ''}
        updated_at = NOW()
      RETURNING *
    `;

    const result = await client.query(sql, values);
    return res.json({ success: true, costs: result.rows[0] });
  } catch (error) {
    console.error('Error upserting product costs:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
});

// Fetch per-ASIN costs
app.get('/api/products/:asin/costs', async (req, res) => {
  const { asin } = req.params;
  const client = new Client({
    host: process.env.DB_HOST || '49.12.191.119',
    port: Number(process.env.DB_PORT || 5456),
    user: process.env.DB_USER || 'saas',
    password: process.env.DB_PASSWORD || 'saas_password_123',
    database: process.env.DB_NAME || 'amazon_monitor'
  });
  try {
    await client.connect();
    await client.query('CREATE TABLE IF NOT EXISTS product_costs (id BIGSERIAL PRIMARY KEY, asin TEXT UNIQUE NOT NULL)');
    const result = await client.query('SELECT * FROM product_costs WHERE asin = $1', [asin]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Costs not found for ASIN' });
    }
    return res.json({ success: true, costs: result.rows[0] });
  } catch (error) {
    console.error('Error fetching product costs:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
});

app.get('/api/products/:asin/cogs', async (req, res) => {
  const { asin } = req.params;
  const client = new Client({
    host: process.env.DB_HOST || '49.12.191.119',
    port: Number(process.env.DB_PORT || 5456),
    user: process.env.DB_USER || 'saas',
    password: process.env.DB_PASSWORD || 'saas_password_123',
    database: process.env.DB_NAME || 'amazon_monitor'
  });
  try {
    await client.connect();
    const result = await client.query('SELECT asin, cogs FROM products WHERE asin = $1', [asin]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    return res.json({ success: true, product: result.rows[0] });
  } catch (error) {
    console.error('Error fetching product cogs:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
});

// Finances sync endpoint (pulls fees from SP-API and updates DB)
try {
  const { syncFinances } = require('./sp-finances-sync');
  app.post('/api/sync/finances', async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const result = await syncFinances({ startDate, endDate });
      res.json({ success: true, ...result });
    } catch (e) {
      res.status(500).json({ success: false, error: e?.message || 'Sync failed' });
    }
  });
  console.log('✅ Finances sync endpoint ready (/api/sync/finances)');
} catch (e) {
  console.log('⚠️ Finances sync service not loaded:', e?.message || e);
}

// Sales routes - using the compiled JavaScript version
try {
  const salesRoutes = require('./dist/routes/sales.routes');
  app.use('/api/sales', salesRoutes.default || salesRoutes);
  console.log('✅ Sales routes loaded from TypeScript');
} catch (error) {
  console.log('⚠️ TypeScript routes not compiled, creating basic sales endpoint');
  
  // Basic sales endpoint with real data including images
  app.get('/api/sales', async (req, res) => {
    const { page = 1, limit = 10, startDate, endDate } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const offset = (pageNum - 1) * limitNum;
    
    const client = new Client({
      host: process.env.DB_HOST || '49.12.191.119',
      port: Number(process.env.DB_PORT || 5456),
      user: process.env.DB_USER || 'saas',
      password: process.env.DB_PASSWORD || 'saas_password_123',
      database: process.env.DB_NAME || 'amazon_monitor'
    });
    
    try {
      await client.connect();
      
      // Get sales data from order_items joined with Product including image information
      const query = `
        SELECT 
          oi.seller_sku AS sku,
          oi.title AS product,
          oi.asin,
          SUM(oi.quantity_ordered) AS units,
SUM(
            CASE 
              WHEN oi.price_amount IS NOT NULL THEN (oi.price_amount)::numeric
              WHEN oi.item_price_amount IS NOT NULL THEN (oi.item_price_amount)::numeric
              WHEN oi.listing_price IS NOT NULL THEN (oi.listing_price * oi.quantity_ordered)
              WHEN oi.item_price IS NOT NULL THEN (oi.item_price * oi.quantity_ordered)
              WHEN p."currentPrice" IS NOT NULL THEN (p."currentPrice" * oi.quantity_ordered)
              ELSE 0
            END
          ) AS revenue,
          COUNT(DISTINCT oi.amazon_order_id) AS orders,
          CASE WHEN SUM(oi.quantity_ordered) > 0 THEN
            SUM(
              CASE 
                WHEN oi.price_amount IS NOT NULL THEN (oi.price_amount)::numeric
                WHEN oi.listing_price IS NOT NULL THEN (oi.listing_price * oi.quantity_ordered)
                WHEN oi.item_price IS NOT NULL THEN (oi.item_price * oi.quantity_ordered)
                WHEN p."currentPrice" IS NOT NULL THEN (p."currentPrice" * oi.quantity_ordered)
                ELSE 0
              END
            ) / NULLIF(SUM(oi.quantity_ordered), 0)
          ELSE 0 END AS price,
          COALESCE(
            oi.product_image_url, 
            oi.image_url,
            p."imageUrl"
          ) AS image_url,
          p.brand,
          p.category,
          COALESCE(
            MAX(inv.total_quantity),
            MAX(inv.fba_available_quantity),
            MAX(p."fbaStock"),
            MAX(p."totalStock"),
            0
          ) AS stock,
          MAX(pr.seller_count) AS sellers,
          MAX(pr.buy_box_seller) AS buy_box_winner
        FROM order_items oi
        LEFT JOIN "Product" p ON oi.asin = p.asin
        LEFT JOIN products pr ON pr.asin = oi.asin
        LEFT JOIN LATERAL (
          SELECT oi2.fba_available_quantity, oi2.total_quantity
          FROM order_items oi2
          WHERE oi2.asin = oi.asin
          ORDER BY oi2.inventory_updated_at DESC NULLS LAST, oi2.created_at DESC NULLS LAST
          LIMIT 1
        ) inv ON TRUE
        WHERE oi.asin IS NOT NULL
        GROUP BY 
          oi.seller_sku, 
          oi.title, 
          oi.asin, 
          p."imageUrl", 
          oi.product_image_url,
          oi.image_url,
          p.brand,
          p.category
        ORDER BY revenue DESC
        LIMIT $1 OFFSET $2
      `;
      
      const countQuery = `
        SELECT COUNT(DISTINCT oi.seller_sku) as total
        FROM order_items oi
        LEFT JOIN "Product" p ON oi.asin = p.asin
        LEFT JOIN products pr ON pr.asin = oi.asin
        WHERE oi.asin IS NOT NULL
      `;
      
      const [salesResult, countResult] = await Promise.all([
        client.query(query, [limitNum, offset]),
        client.query(countQuery)
      ]);
      
      // Process results to ensure image URLs are properly formatted
      const processedData = salesResult.rows.map(row => ({
        ...row,
        image_url: row.image_url ? (
          row.image_url.startsWith('http') 
            ? row.image_url 
            : `/product-images/${row.asin}.jpg`
        ) : `/product-images/${row.asin}.jpg`,
        revenue: parseFloat(row.revenue) || 0,
        price: parseFloat(row.price) || 0,
        units: parseInt(row.units) || 0,
        orders: parseInt(row.orders) || 0,
        stock: Number(row.stock) || 0,
        sellers: Number(row.sellers) || 0
      }));
      
      res.json({
        success: true,
        data: processedData,
        pagination: {
          total: parseInt(countResult.rows[0].total),
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(countResult.rows[0].total / limitNum)
        }
      });
    } catch (error) {
      console.error('Sales query error:', error);
      res.status(500).json({ error: error.message });
    } finally {
      await client.end();
    }
  });
  
  // Dashboard stats endpoint
  app.get('/api/dashboard/stats', async (req, res) => {
    const client = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER || 'app',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'app'
    });
    
    try {
      await client.connect();
      
      const statsQuery = `
        SELECT 
          COUNT(DISTINCT o."amazonOrderId") as total_orders,
          COUNT(DISTINCT oi.asin) as unique_products,
          SUM(oi.quantity_ordered) as total_units,
          SUM(p."currentPrice" * oi.quantity_ordered) as total_revenue
        FROM "Order" o
        LEFT JOIN order_items oi ON o."amazonOrderId" = oi.amazon_order_id
        LEFT JOIN "Product" p ON oi.asin = p.asin
        WHERE p.asin IS NOT NULL
      `;
      
      const result = await client.query(statsQuery);
      
      res.json({
        success: true,
        data: {
          totalOrders: result.rows[0].total_orders || 0,
          uniqueProducts: result.rows[0].unique_products || 0,
          totalUnits: result.rows[0].total_units || 0,
          totalRevenue: result.rows[0].total_revenue || 0
        }
      });
    } catch (error) {
      console.error('Dashboard stats error:', error);
      res.status(500).json({ error: error.message });
    } finally {
      await client.end();
    }
  });
}

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    status: err.status || 500
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Backend server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔒 Auth check: http://localhost:${PORT}/auth`);
  console.log(`💰 Sales API: http://localhost:${PORT}/api/sales/summary`);
});