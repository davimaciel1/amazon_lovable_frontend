# Database Schema

Generated: 2025-09-01T12:51:04.341Z

## Tables Overview

| Table | Columns | Purpose |
|-------|---------|----------|
| Alert | 15 | Data storage |
| BusinessMetrics | 14 | Data storage |
| Credentials | 14 | Data storage |
| FinanceEvent | 13 | Data storage |
| Order | 30 | Data storage |
| Product | 34 | Data storage |
| SyncJob | 14 | Data storage |
| SyncLog | 8 | Data storage |
| Tenant | 8 | Data storage |
| ads_sp_ad_groups | 8 | Data storage |
| ads_sp_advertised_product_daily | 28 | Data storage |
| ads_sp_campaigns | 13 | Data storage |
| ads_sp_product_ads | 9 | Data storage |
| advertising_ad_groups | 7 | Data storage |
| advertising_campaigns | 12 | Data storage |
| advertising_keywords | 8 | Data storage |
| advertising_metrics | 18 | Data storage |
| advertising_product_metrics | 20 | Data storage |
| amazon_ads_profiles | 10 | Data storage |
| amazon_credentials | 10 | Data storage |
| api_tokens | 5 | Data storage |
| brain_audit | 5 | CEREBRO quality management |
| brain_budgets | 7 | CEREBRO quality management |
| brain_competitors | 8 | CEREBRO quality management |
| brain_findings | 10 | CEREBRO quality management |
| brain_issues | 14 | CEREBRO quality management |
| brain_runs | 9 | CEREBRO quality management |
| category_performance | 5 | Data storage |
| daily_metrics | 8 | Data storage |
| monthly_sales | 6 | Sales data |
| order_items | 87 | Data storage |
| orders | 71 | Data storage |
| orders_backup_1756036749815 | 40 | Data storage |
| orders_pii_secure | 11 | Data storage |
| pii_monitoring | 5 | Data storage |
| product_performance | 10 | Data storage |
| products | 24 | Data storage |
| rate_limit_tracker | 8 | Data storage |
| sales_metrics | 11 | Sales data |
| sellers | 8 | Data storage |
| sync_logs | 10 | Data storage |
| test_connection | 3 | Data storage |
| users | 14 | User management |

## CEREBRO Tables

- `brain_runs`: Quality check execution history
- `brain_findings`: Issues found during checks
- `brain_budgets`: Performance thresholds
- `brain_competitors`: Competitor tracking
- `brain_issues`: Backlog with ICE scoring
- `brain_audit`: Audit log
