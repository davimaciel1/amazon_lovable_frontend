const express = require('express');
const router = express.Router();
const { Client } = require('pg');

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'app',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'app'
};

// Get database schema
router.get('/schema', async (req, res) => {
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    
    // Get all tables and columns
    const schemaQuery = `
      SELECT 
        table_name,
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position;
    `;
    
    const result = await client.query(schemaQuery);
    
    // Group by table
    const schema = {};
    result.rows.forEach(row => {
      if (!schema[row.table_name]) {
        schema[row.table_name] = {
          columns: [],
          sample_query: `SELECT * FROM ${row.table_name} LIMIT 5;`
        };
      }
      schema[row.table_name].columns.push({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES'
      });
    });
    
    // Add a note about missing prices
    schema._notes = {
      pricing: 'Note: Most order_items have NULL item_price. Join with Product table to get prices.',
      joins: 'Join order_items with Product table on oi.asin = p.asin to get product prices',
      filtering: 'Use WHERE COALESCE(oi.item_price, p."currentPrice") IS NOT NULL to filter items with prices'
    };
    
    res.json({ schema });
    
  } catch (error) {
    console.error('Schema error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
});

// Execute SQL query
router.post('/execute', async (req, res) => {
  const { sql } = req.body;
  
  if (!sql) {
    return res.status(400).json({ error: 'SQL query is required' });
  }
  
  // Security: Only allow SELECT queries
  if (!sql.trim().toUpperCase().startsWith('SELECT')) {
    return res.status(403).json({ error: 'Only SELECT queries are allowed' });
  }
  
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    
    // Add timeout and row limit for safety
    const safeSql = sql.includes('LIMIT') ? sql : `${sql.replace(/;$/, '')} LIMIT 1000;`;
    
    console.log('Executing SQL:', safeSql);
    const result = await client.query(safeSql);
    
    res.json({
      data: result.rows,
      rowCount: result.rowCount,
      fields: result.fields.map(f => ({
        name: f.name,
        dataType: f.dataTypeID
      }))
    });
    
  } catch (error) {
    console.error('Query error:', error);
    res.status(400).json({ 
      error: error.message,
      hint: error.hint || 'Check your SQL syntax',
      position: error.position
    });
  } finally {
    await client.end();
  }
});

// Generate SQL from natural language (uses OpenAI if API key provided)
router.post('/generate', async (req, res) => {
  const { query, useAI = false } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: 'Query description is required' });
  }
  
  // If OpenAI API key is available, use it
  if (useAI && process.env.OPENAI_API_KEY) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `You are a PostgreSQL expert. Generate SQL queries for an Amazon sales database.
                       Main tables (case-sensitive): 
                       - "Order": id, "amazonOrderId", "purchaseDate", "orderStatus", "orderTotal", "marketplaceId", "buyerEmail"
                       - order_items: amazon_order_id, asin, seller_sku, title, quantity_ordered, item_price, category
                       - "Product": asin, sku, title, "currentPrice", "totalStock", category, "imageUrl"
                       Only generate SELECT queries. Include proper formatting and LIMIT clause. Use double quotes for table/column names with uppercase letters.`
            },
            {
              role: 'user',
              content: query
            }
          ],
          temperature: 0.3,
          max_tokens: 500
        })
      });
      
      const data = await response.json();
      const sql = data.choices[0].message.content;
      
      return res.json({ sql, ai_generated: true });
    } catch (error) {
      console.error('OpenAI error:', error);
    }
  }
  
  // Fallback to pattern-based generation
  const sql = generateSQLFromPatterns(query);
  res.json({ sql, ai_generated: false });
});

// Pattern-based SQL generation (fallback)
function generateSQLFromPatterns(query) {
  const lower = query.toLowerCase();
  
  // Recent sales - join with Product for prices
  if (lower.includes('recent') || lower.includes('últim') || lower.includes('novo')) {
    return `SELECT 
  o."amazonOrderId" AS "Order ID",
  oi.seller_sku AS "SKU",
  oi.title AS "Product",
  oi.quantity_ordered AS "Units",
  COALESCE(oi.item_price, p."currentPrice" * oi.quantity_ordered) AS "Revenue",
  o."purchaseDate" AS "Date"
FROM "Order" o
JOIN order_items oi ON o."amazonOrderId" = oi.amazon_order_id
LEFT JOIN "Product" p ON oi.asin = p.asin
WHERE COALESCE(oi.item_price, p."currentPrice") IS NOT NULL
ORDER BY o."purchaseDate" DESC
LIMIT 20;`;
  }
  
  // Top products - use Product prices when available
  if (lower.includes('top') || lower.includes('melhores') || lower.includes('mais vendid')) {
    return `SELECT 
  oi.seller_sku AS "SKU",
  oi.title AS "Product",
  COUNT(*) AS "Total Sales",
  SUM(oi.quantity_ordered) AS "Units Sold",
  SUM(p."currentPrice" * oi.quantity_ordered) AS "Total Revenue",
  AVG(p."currentPrice") AS "Avg Price"
FROM order_items oi
INNER JOIN "Product" p ON oi.asin = p.asin
GROUP BY oi.seller_sku, oi.title
ORDER BY "Total Revenue" DESC
LIMIT 10;`;
  }
  
  // By marketplace - only count items with prices
  if (lower.includes('marketplace') || lower.includes('mercado')) {
    return `SELECT 
  o."marketplaceId" AS "Marketplace",
  COUNT(DISTINCT o."amazonOrderId") AS "Orders",
  SUM(oi.quantity_ordered) AS "Units",
  SUM(COALESCE(oi.item_price, p."currentPrice" * oi.quantity_ordered)) AS "Revenue"
FROM "Order" o
JOIN order_items oi ON o."amazonOrderId" = oi.amazon_order_id
LEFT JOIN "Product" p ON oi.asin = p.asin
WHERE COALESCE(oi.item_price, p."currentPrice") IS NOT NULL
GROUP BY o."marketplaceId"
ORDER BY "Revenue" DESC NULLS LAST;`;
  }
  
  // Daily sales - only count items with prices
  if (lower.includes('daily') || lower.includes('diári') || lower.includes('por dia')) {
    return `SELECT 
  DATE(o."purchaseDate") AS "Date",
  COUNT(DISTINCT o."amazonOrderId") AS "Orders",
  SUM(oi.quantity_ordered) AS "Units",
  SUM(COALESCE(oi.item_price, p."currentPrice" * oi.quantity_ordered)) AS "Revenue"
FROM "Order" o
JOIN order_items oi ON o."amazonOrderId" = oi.amazon_order_id
LEFT JOIN "Product" p ON oi.asin = p.asin
WHERE o."purchaseDate" >= CURRENT_DATE - INTERVAL '30 days'
  AND COALESCE(oi.item_price, p."currentPrice") IS NOT NULL
GROUP BY DATE(o."purchaseDate")
ORDER BY "Date" DESC;`;
  }
  
  // Low stock products
  if (lower.includes('problem') || lower.includes('bad') || lower.includes('ruim') || lower.includes('stock')) {
    return `SELECT 
  p.sku AS "SKU",
  p.title AS "Product",
  p."totalStock" AS "Stock",
  p."currentPrice" AS "Price"
FROM "Product" p
WHERE p."totalStock" < 10
ORDER BY p."totalStock" ASC
LIMIT 20;`;
  }
  
  // High price products - only products with actual prices
  if (lower.includes('roi') || lower.includes('lucr') || lower.includes('margem') || lower.includes('expensive')) {
    return `SELECT 
  oi.seller_sku AS "SKU",
  oi.title AS "Product",
  AVG(COALESCE(oi.item_price, p."currentPrice")) AS "Avg Price",
  COUNT(*) AS "Orders",
  SUM(oi.quantity_ordered) AS "Units Sold"
FROM order_items oi
LEFT JOIN "Product" p ON oi.asin = p.asin
WHERE COALESCE(oi.item_price, p."currentPrice") IS NOT NULL
GROUP BY oi.seller_sku, oi.title
HAVING AVG(COALESCE(oi.item_price, p."currentPrice")) > 100
ORDER BY "Avg Price" DESC
LIMIT 20;`;
  }
  
  // Default: summary - only count items with prices
  return `SELECT 
  COUNT(DISTINCT o."amazonOrderId") AS "Total Orders",
  SUM(oi.quantity_ordered) AS "Total Units",
  SUM(COALESCE(oi.item_price, p."currentPrice" * oi.quantity_ordered)) AS "Total Revenue",
  AVG(COALESCE(oi.item_price, p."currentPrice")) AS "Avg Order Value"
FROM "Order" o
JOIN order_items oi ON o."amazonOrderId" = oi.amazon_order_id
LEFT JOIN "Product" p ON oi.asin = p.asin
WHERE o."purchaseDate" >= CURRENT_DATE - INTERVAL '30 days'
  AND COALESCE(oi.item_price, p."currentPrice") IS NOT NULL;`;
}

module.exports = router;
