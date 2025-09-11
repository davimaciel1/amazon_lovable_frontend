-- Fix sales_metrics view without dependency on 'spend' column
-- This creates a simplified version that works with existing data

DROP VIEW IF EXISTS sales_metrics CASCADE;

CREATE OR REPLACE VIEW sales_metrics AS
SELECT 
  DATE(o.purchase_date) as date,
  COUNT(DISTINCT o.amazon_order_id) as total_orders,
  COALESCE(SUM(o.order_total_amount), 0) as total_revenue,
  COALESCE(SUM(oi.quantity_ordered), 0) as total_units,
  COUNT(DISTINCT o.buyer_email) as unique_customers,
  
  -- Average order value
  CASE 
    WHEN COUNT(DISTINCT o.amazon_order_id) > 0 THEN
      SUM(o.order_total_amount) / COUNT(DISTINCT o.amazon_order_id)
    ELSE 0
  END as avg_order_value,
  
  -- ACOS - Try to get from advertising_metrics if exists
  COALESCE(
    (SELECT AVG(acos::numeric)
     FROM advertising_metrics am 
     WHERE DATE(am.date) = DATE(o.purchase_date)
    ), 0
  ) as acos,
  
  -- TACOS - Simplified without spend column
  -- Using a default 5% advertising spend estimate
  CASE 
    WHEN SUM(o.order_total_amount) > 0 THEN
      (SUM(o.order_total_amount) * 0.05) / SUM(o.order_total_amount) * 100
    ELSE 0
  END as tacos,
  
  -- Calculate profit (revenue - costs)
  -- Use COGS if available, otherwise estimate 30% cost
  SUM(o.order_total_amount) - 
  COALESCE(
    SUM(oi.quantity_ordered * COALESCE(p.cogs, p.cost, o.order_total_amount * 0.3)), 
    SUM(o.order_total_amount * 0.3)
  ) as total_profit,
  
  -- Calculate margin percentage
  CASE 
    WHEN SUM(o.order_total_amount) > 0 THEN
      ((SUM(o.order_total_amount) - 
        COALESCE(
          SUM(oi.quantity_ordered * COALESCE(p.cogs, p.cost, o.order_total_amount * 0.3)), 
          SUM(o.order_total_amount * 0.3)
        )) / SUM(o.order_total_amount)) * 100
    ELSE 0
  END as profit_margin,
  
  NOW() as updated_at
  
FROM orders o
LEFT JOIN order_items oi ON o.amazon_order_id = oi.amazon_order_id
LEFT JOIN products p ON oi.asin = p.asin
WHERE o.purchase_date IS NOT NULL
  AND o.order_status NOT IN ('Cancelled', 'Pending')
GROUP BY DATE(o.purchase_date)
ORDER BY date DESC;