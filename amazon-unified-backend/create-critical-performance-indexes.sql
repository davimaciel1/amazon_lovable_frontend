-- Create critical performance indexes for existing tables and enhanced audit capabilities
-- This file adds essential indexes that are missing from the core tables for better performance

-- =====================================================================
-- INDEXES FOR EXISTING CORE TABLES (unified_sales_lines assumed structure)
-- =====================================================================

-- Critical indexes for unified_sales_lines table (based on typical e-commerce patterns)
-- These indexes will dramatically improve query performance for common operations

-- Primary performance indexes for sales queries
CREATE INDEX IF NOT EXISTS idx_unified_sales_lines_purchase_date ON unified_sales_lines(purchase_date);
CREATE INDEX IF NOT EXISTS idx_unified_sales_lines_product_key ON unified_sales_lines(product_key);
CREATE INDEX IF NOT EXISTS idx_unified_sales_lines_sku ON unified_sales_lines(sku);
CREATE INDEX IF NOT EXISTS idx_unified_sales_lines_channel ON unified_sales_lines(channel);
CREATE INDEX IF NOT EXISTS idx_unified_sales_lines_order_id ON unified_sales_lines(order_id);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_unified_sales_lines_date_channel ON unified_sales_lines(purchase_date, channel);
CREATE INDEX IF NOT EXISTS idx_unified_sales_lines_date_product ON unified_sales_lines(purchase_date, product_key);
CREATE INDEX IF NOT EXISTS idx_unified_sales_lines_product_channel ON unified_sales_lines(product_key, channel);

-- Performance indexes for aggregation queries
CREATE INDEX IF NOT EXISTS idx_unified_sales_lines_units_revenue ON unified_sales_lines(units, revenue) WHERE units > 0 AND revenue > 0;

-- Date-based partitioning support indexes
CREATE INDEX IF NOT EXISTS idx_unified_sales_lines_date_desc ON unified_sales_lines(purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_unified_sales_lines_month ON unified_sales_lines(DATE_TRUNC('month', purchase_date));

-- =====================================================================
-- ENHANCED AUDIT SYSTEM INDEXES
-- =====================================================================

-- Additional audit system indexes for advanced queries and reporting
CREATE INDEX IF NOT EXISTS idx_dq_runs_duration ON dq_runs(duration_seconds) WHERE duration_seconds IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dq_runs_records_checked ON dq_runs(total_records_checked);
CREATE INDEX IF NOT EXISTS idx_dq_runs_findings_count ON dq_runs(findings_count);

-- Advanced finding analysis indexes
CREATE INDEX IF NOT EXISTS idx_dq_findings_severity_type ON dq_findings(severity, finding_type);
CREATE INDEX IF NOT EXISTS idx_dq_findings_confidence ON dq_findings(confidence_score) WHERE confidence_score < 1.0;
CREATE INDEX IF NOT EXISTS idx_dq_findings_unfixed ON dq_findings(created_at) WHERE fixed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dq_findings_auto_fixable ON dq_findings(auto_fixable, created_at) WHERE auto_fixable = true;

-- Metrics analysis and trending indexes
CREATE INDEX IF NOT EXISTS idx_dq_metrics_daily_change ON dq_metrics_daily(change_percentage) WHERE change_percentage IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dq_metrics_daily_value ON dq_metrics_daily(metric_value);
CREATE INDEX IF NOT EXISTS idx_dq_metrics_daily_threshold_violations ON dq_metrics_daily(metric_date, table_name) WHERE is_within_threshold = false;

-- Time-series analysis indexes for metrics
CREATE INDEX IF NOT EXISTS idx_dq_metrics_daily_week ON dq_metrics_daily(DATE_TRUNC('week', metric_date), table_name, metric_name);
CREATE INDEX IF NOT EXISTS idx_dq_metrics_daily_month ON dq_metrics_daily(DATE_TRUNC('month', metric_date), table_name, metric_name);

-- =====================================================================
-- INDEXES FOR ML_INVENTORY TABLE PERFORMANCE
-- =====================================================================

-- Additional indexes for ml_inventory table based on common access patterns
CREATE INDEX IF NOT EXISTS idx_ml_inventory_updated_at ON ml_inventory(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ml_inventory_available_quantity ON ml_inventory(available_quantity) WHERE available_quantity > 0;
CREATE INDEX IF NOT EXISTS idx_ml_inventory_site_status ON ml_inventory(site_id, status);

-- =====================================================================
-- FULL TEXT SEARCH INDEXES (for better search performance)
-- =====================================================================

-- Full text search indexes for better product search performance
-- These assume title/description fields exist in the sales tables
CREATE INDEX IF NOT EXISTS idx_unified_sales_lines_title_search 
    ON unified_sales_lines USING gin(to_tsvector('english', COALESCE(title, '')));

-- =====================================================================
-- PARTIAL INDEXES FOR SPECIFIC CONDITIONS
-- =====================================================================

-- Partial indexes for common filtered queries (more efficient storage)
CREATE INDEX IF NOT EXISTS idx_unified_sales_lines_positive_sales 
    ON unified_sales_lines(purchase_date, product_key) 
    WHERE units > 0 AND revenue > 0;

CREATE INDEX IF NOT EXISTS idx_unified_sales_lines_zero_sales 
    ON unified_sales_lines(purchase_date, product_key) 
    WHERE units <= 0 OR revenue <= 0;

-- Recent data indexes (last 30 days) for hot data access
CREATE INDEX IF NOT EXISTS idx_unified_sales_lines_recent 
    ON unified_sales_lines(purchase_date DESC, product_key) 
    WHERE purchase_date >= CURRENT_DATE - INTERVAL '30 days';

-- =====================================================================
-- STATISTICAL INDEXES FOR BETTER QUERY PLANNING
-- =====================================================================

-- Update table statistics to help the query planner make better decisions
-- These are not indexes but important for performance
ANALYZE unified_sales_lines;
ANALYZE ml_inventory;
ANALYZE users;

-- =====================================================================
-- PERFORMANCE MONITORING INDEXES
-- =====================================================================

-- Indexes to support performance monitoring queries
CREATE INDEX IF NOT EXISTS idx_dq_runs_performance_analysis 
    ON dq_runs(run_type, duration_seconds, total_records_checked) 
    WHERE status = 'completed';

-- =====================================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================================

COMMENT ON INDEX idx_unified_sales_lines_purchase_date IS 'Primary temporal index for sales queries';
COMMENT ON INDEX idx_unified_sales_lines_date_channel IS 'Composite index for date-channel filtered queries';
COMMENT ON INDEX idx_unified_sales_lines_positive_sales IS 'Partial index for valid sales records only';
COMMENT ON INDEX idx_dq_runs_performance_analysis IS 'Index for audit system performance monitoring';

-- =====================================================================
-- MAINTENANCE RECOMMENDATIONS
-- =====================================================================

-- Create a function to show index usage statistics
CREATE OR REPLACE FUNCTION show_audit_index_usage() 
RETURNS TABLE(
    table_name text,
    index_name text,
    index_size text,
    scans bigint,
    tuples_read bigint,
    tuples_fetched bigint
) AS $$
SELECT 
    schemaname||'.'||tablename as table_name,
    indexname as index_name,
    pg_size_pretty(pg_relation_size(indexrelname::regclass)) as index_size,
    idx_scan as scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes 
WHERE schemaname = 'public'
  AND (tablename LIKE 'dq_%' 
       OR tablename = 'unified_sales_lines' 
       OR tablename = 'ml_inventory'
       OR tablename LIKE 'mv_%')
ORDER BY idx_scan DESC;
$$ LANGUAGE sql;

COMMENT ON FUNCTION show_audit_index_usage() IS 'Shows usage statistics for audit system and core table indexes';