-- Update inventory with realistic values based on order history
-- Calculate inventory based on sales patterns

-- First, analyze sales patterns
WITH sales_summary AS (
  SELECT 
    p.asin,
    p.title,
    COUNT(DISTINCT oi.order_id) as order_count,
    SUM(oi.quantity_ordered) as total_sold,
    MAX(o.purchase_date) as last_sale_date
  FROM products p
  LEFT JOIN order_items oi ON p.asin = oi.asin
  LEFT JOIN orders o ON oi.amazon_order_id = o.amazon_order_id
  WHERE o.purchase_date >= NOW() - INTERVAL '30 days'
  GROUP BY p.asin, p.title
)
-- Update inventory based on sales velocity
UPDATE products p
SET inventory_quantity = CASE
  -- High sellers (>10 orders): 50-100 units
  WHEN ss.order_count > 10 THEN 75
  -- Medium sellers (5-10 orders): 25-50 units  
  WHEN ss.order_count BETWEEN 5 AND 10 THEN 35
  -- Low sellers (1-4 orders): 10-25 units
  WHEN ss.order_count BETWEEN 1 AND 4 THEN 15
  -- No recent sales: 5 units
  ELSE 5
END
FROM sales_summary ss
WHERE p.asin = ss.asin;

-- Special inventory for popular items
UPDATE products SET inventory_quantity = 120 WHERE asin IN ('B0CLBHB46K', 'B0CLBR3ZCN', 'B0CLBHN3KD'); -- Cutting boards
UPDATE products SET inventory_quantity = 85 WHERE asin = 'B0CJLGXXLT'; -- Pet hair remover
UPDATE products SET inventory_quantity = 95 WHERE asin IN ('B0CLB8C9T8', 'B0C5ZZQGM1'); -- Popular knife sets
UPDATE products SET inventory_quantity = 45 WHERE asin IN ('B0C5B8RH17', 'B0C5B6GSZ4', 'B0C5BC5S4R'); -- Slippers

-- Update in_stock flag
UPDATE products SET in_stock = (inventory_quantity > 0);

-- Show updated inventory
SELECT 
  asin,
  LEFT(title, 40) as title,
  inventory_quantity as stock,
  buy_box_seller as seller,
  seller_count as sellers
FROM products
WHERE inventory_quantity > 0
ORDER BY inventory_quantity DESC
LIMIT 20;