-- Create audit infrastructure for data integrity monitoring
-- This file creates the complete audit system for tracking data quality and integrity

-- 1. DQ_RUNS: Track each verification run with metadata
CREATE TABLE IF NOT EXISTS dq_runs (
    id SERIAL PRIMARY KEY,
    run_name text NOT NULL,
    run_type text NOT NULL, -- 'duplicate_detection', 'anomaly_scan', 'integrity_check'
    status text NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    duration_seconds integer,
    total_records_checked bigint DEFAULT 0,
    findings_count integer DEFAULT 0,
    error_message text,
    metadata jsonb DEFAULT '{}',
    created_by text DEFAULT 'system',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. DQ_FINDINGS: Store specific integrity violations found
CREATE TABLE IF NOT EXISTS dq_findings (
    id SERIAL PRIMARY KEY,
    run_id integer NOT NULL REFERENCES dq_runs(id) ON DELETE CASCADE,
    finding_type text NOT NULL, -- 'duplicate', 'missing_data', 'invalid_data', 'anomaly'
    severity text NOT NULL DEFAULT 'medium', -- 'critical', 'high', 'medium', 'low'
    table_name text NOT NULL,
    column_name text,
    record_id text,
    record_keys jsonb DEFAULT '{}', -- Store identifying keys for the problematic record
    issue_description text NOT NULL,
    suggested_action text,
    current_value text,
    expected_value text,
    confidence_score numeric(3,2) DEFAULT 1.0, -- 0.00 to 1.00
    auto_fixable boolean DEFAULT false,
    fixed_at timestamptz,
    fixed_by text,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. DQ_METRICS_DAILY: For trend analysis and reporting
CREATE TABLE IF NOT EXISTS dq_metrics_daily (
    id SERIAL PRIMARY KEY,
    metric_date date NOT NULL,
    table_name text NOT NULL,
    metric_name text NOT NULL, -- 'record_count', 'duplicate_count', 'null_percentage', etc.
    metric_value numeric NOT NULL,
    previous_value numeric,
    change_percentage numeric,
    threshold_min numeric,
    threshold_max numeric,
    is_within_threshold boolean DEFAULT true,
    metadata jsonb DEFAULT '{}',
    calculated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(metric_date, table_name, metric_name)
);

-- Create indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_dq_runs_status ON dq_runs(status);
CREATE INDEX IF NOT EXISTS idx_dq_runs_type ON dq_runs(run_type);
CREATE INDEX IF NOT EXISTS idx_dq_runs_started_at ON dq_runs(started_at);
CREATE INDEX IF NOT EXISTS idx_dq_runs_completed_at ON dq_runs(completed_at);

CREATE INDEX IF NOT EXISTS idx_dq_findings_run_id ON dq_findings(run_id);
CREATE INDEX IF NOT EXISTS idx_dq_findings_type ON dq_findings(finding_type);
CREATE INDEX IF NOT EXISTS idx_dq_findings_severity ON dq_findings(severity);
CREATE INDEX IF NOT EXISTS idx_dq_findings_table ON dq_findings(table_name);
CREATE INDEX IF NOT EXISTS idx_dq_findings_created_at ON dq_findings(created_at);
CREATE INDEX IF NOT EXISTS idx_dq_findings_fixed_at ON dq_findings(fixed_at);

CREATE INDEX IF NOT EXISTS idx_dq_metrics_date ON dq_metrics_daily(metric_date);
CREATE INDEX IF NOT EXISTS idx_dq_metrics_table ON dq_metrics_daily(table_name);
CREATE INDEX IF NOT EXISTS idx_dq_metrics_name ON dq_metrics_daily(metric_name);
CREATE INDEX IF NOT EXISTS idx_dq_metrics_threshold ON dq_metrics_daily(is_within_threshold);

-- Add table comments for documentation
COMMENT ON TABLE dq_runs IS 'Tracks data quality verification runs with execution metadata and results summary';
COMMENT ON TABLE dq_findings IS 'Stores specific data integrity violations found during quality checks';
COMMENT ON TABLE dq_metrics_daily IS 'Daily aggregated metrics for trend analysis and threshold monitoring';

-- Add column comments for key fields
COMMENT ON COLUMN dq_runs.run_type IS 'Type of data quality check: duplicate_detection, anomaly_scan, integrity_check';
COMMENT ON COLUMN dq_findings.severity IS 'Impact level: critical, high, medium, low';
COMMENT ON COLUMN dq_findings.confidence_score IS 'Algorithm confidence in finding (0.00-1.00)';
COMMENT ON COLUMN dq_metrics_daily.is_within_threshold IS 'Whether metric value is within acceptable range';