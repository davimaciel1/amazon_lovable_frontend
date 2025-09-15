-- Create materialized view for efficient daily sales aggregation
-- This provides pre-aggregated sales data by product/sku/day for performance optimization

-- Drop the materialized view if it exists (for updates)
DROP MATERIALIZED VIEW IF EXISTS mv_unified_sales_daily;

-- Create the materialized view for daily sales aggregation
CREATE MATERIALIZED VIEW mv_unified_sales_daily AS
SELECT 
    DATE(purchase_date) AS sale_date,
    product_key,
    sku,
    title,
    channel, -- 'amazon' or 'ml'
    -- Aggregated metrics
    COUNT(DISTINCT order_id) AS total_orders,
    SUM(units)::numeric AS total_units,
    SUM(revenue)::numeric AS total_revenue,
    AVG(revenue / NULLIF(units, 0))::numeric AS avg_price,
    MIN(purchase_date) AS first_sale_time,
    MAX(purchase_date) AS last_sale_time,
    -- Quality metrics
    COUNT(*) AS line_item_count,
    COUNT(CASE WHEN units <= 0 THEN 1 END) AS zero_unit_sales,
    COUNT(CASE WHEN revenue <= 0 THEN 1 END) AS zero_revenue_sales,
    -- Metadata
    now() AS last_updated
FROM unified_sales_lines 
WHERE purchase_date IS NOT NULL 
  AND product_key IS NOT NULL
GROUP BY 
    DATE(purchase_date),
    product_key,
    sku,
    title,
    channel;

-- Create indexes on the materialized view for optimal query performance
CREATE UNIQUE INDEX idx_mv_unified_sales_daily_unique 
    ON mv_unified_sales_daily(sale_date, product_key, sku, channel);

CREATE INDEX idx_mv_unified_sales_daily_date 
    ON mv_unified_sales_daily(sale_date);

CREATE INDEX idx_mv_unified_sales_daily_product 
    ON mv_unified_sales_daily(product_key);

CREATE INDEX idx_mv_unified_sales_daily_sku 
    ON mv_unified_sales_daily(sku);

CREATE INDEX idx_mv_unified_sales_daily_channel 
    ON mv_unified_sales_daily(channel);

CREATE INDEX idx_mv_unified_sales_daily_revenue 
    ON mv_unified_sales_daily(total_revenue DESC);

CREATE INDEX idx_mv_unified_sales_daily_units 
    ON mv_unified_sales_daily(total_units DESC);

-- Composite indexes for common query patterns
CREATE INDEX idx_mv_unified_sales_daily_date_channel 
    ON mv_unified_sales_daily(sale_date, channel);

CREATE INDEX idx_mv_unified_sales_daily_date_product 
    ON mv_unified_sales_daily(sale_date, product_key);

-- Add comments for documentation
COMMENT ON MATERIALIZED VIEW mv_unified_sales_daily IS 'Pre-aggregated daily sales data for performance optimization. Refresh regularly to maintain data freshness.';

-- Create a function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_unified_sales_daily() 
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_unified_sales_daily;
    -- Log the refresh operation
    INSERT INTO dq_metrics_daily (
        metric_date, 
        table_name, 
        metric_name, 
        metric_value,
        metadata
    ) VALUES (
        CURRENT_DATE,
        'mv_unified_sales_daily',
        'refresh_count',
        1,
        jsonb_build_object('refreshed_at', now(), 'method', 'manual')
    ) ON CONFLICT (metric_date, table_name, metric_name) 
    DO UPDATE SET 
        metric_value = dq_metrics_daily.metric_value + 1,
        metadata = jsonb_build_object('refreshed_at', now(), 'method', 'manual'),
        calculated_at = now();
END;
$$ LANGUAGE plpgsql;

-- Add comments to the refresh function
COMMENT ON FUNCTION refresh_unified_sales_daily() IS 'Refreshes the materialized view and logs the operation to audit metrics';