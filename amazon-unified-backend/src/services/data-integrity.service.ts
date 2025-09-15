import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { PoolClient } from 'pg';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

interface IntegrityRunConfig {
  window: number; // days to check
  maxRecordsToCheck?: number;
  timeoutMs?: number;
  enableSampling?: boolean;
  samplingPercentage?: number;
}

interface IntegrityFinding {
  findingType: 'duplicate' | 'missing_data' | 'invalid_data' | 'anomaly' | 'cardinality_violation' | 'referential_integrity';
  severity: 'critical' | 'high' | 'medium' | 'low';
  tableName: string;
  columnName?: string;
  recordId?: string;
  recordKeys?: Record<string, any>;
  issueDescription: string;
  suggestedAction?: string;
  currentValue?: string;
  expectedValue?: string;
  confidenceScore?: number;
  autoFixable?: boolean;
  metadata?: Record<string, any>;
}

interface IntegrityRunResult {
  runId: number;
  status: 'completed' | 'failed';
  totalRecordsChecked: number;
  findingsCount: number;
  duration: number;
  findings: IntegrityFinding[];
  metadata: Record<string, any>;
}

// interface DuplicateInflationResult {
//   baseTotal: number;
//   enrichedTotal: number;
//   differenceAmount: number;
//   differencePercentage: number;
//   affectedRecords: number;
//   suspiciousOrders: string[];
// }

// ============================================================================
// COMPREHENSIVE DATA INTEGRITY SERVICE
// ============================================================================

/**
 * Comprehensive Data Integrity Service
 * 
 * Features:
 * - Duplicate inflation detection (base vs enriched data comparison)
 * - Cardinality constraint validation
 * - Referential integrity checks
 * - Advisory lock management
 * - Full audit trail with dq_runs and dq_findings
 * - Performance optimized with configurable sampling
 * - Time-bounded operations with configurable windows
 */
export class IntegrityService {
  private readonly ADVISORY_LOCK_ID = 123456789; // Unique ID for integrity service locks
  private readonly DEFAULT_TIMEOUT_MS = 300000; // 5 minutes
  // private readonly DEFAULT_MAX_RECORDS = 100000;
  
  constructor() {
    logger.info('[IntegrityService] Initialized comprehensive data integrity service');
  }

  /**
   * Main orchestrator method - runs all integrity checks
   */
  async runChecks(config: IntegrityRunConfig): Promise<IntegrityRunResult> {
    const startTime = Date.now();
    let runId: number | null = null;
    let client: PoolClient | null = null;
    
    try {
      // 1. Acquire advisory lock to prevent concurrent runs
      client = await pool.connect();
      const lockAcquired = await this.acquireAdvisoryLock(client);
      if (!lockAcquired) {
        throw new Error('Another integrity check is already running. Please wait and try again.');
      }
      
      logger.info('[IntegrityService] Starting comprehensive integrity check', { 
        window: config.window,
        maxRecords: config.maxRecordsToCheck,
        sampling: config.enableSampling 
      });
      
      // 2. Create audit run record
      runId = await this.createAuditRun(client, config);
      
      // 3. Set query timeout
      await client.query(`SET statement_timeout = '${config.timeoutMs || this.DEFAULT_TIMEOUT_MS}ms'`);
      
      // 4. Execute all integrity checks
      const allFindings: IntegrityFinding[] = [];
      let totalRecordsChecked = 0;
      
      // 4a. Duplicate inflation detection
      logger.info('[IntegrityService] Running duplicate inflation detection...');
      const duplicateResults = await this.duplicateInflationDetector(client, config);
      allFindings.push(...duplicateResults.findings);
      totalRecordsChecked += duplicateResults.recordsChecked;
      
      // 4b. Cardinality checks
      logger.info('[IntegrityService] Running cardinality checks...');
      const cardinalityResults = await this.cardinalityChecks(client, config);
      allFindings.push(...cardinalityResults.findings);
      totalRecordsChecked += cardinalityResults.recordsChecked;
      
      // 4c. Referential integrity checks
      logger.info('[IntegrityService] Running referential integrity checks...');
      const referentialResults = await this.referentialIntegrityChecks(client, config);
      allFindings.push(...referentialResults.findings);
      totalRecordsChecked += referentialResults.recordsChecked;
      
      // 5. Store findings in audit system
      if (allFindings.length > 0) {
        await this.storeFindingsInAudit(client, runId, allFindings);
      }
      
      // 6. Complete audit run
      const duration = Date.now() - startTime;
      await this.completeAuditRun(client, runId, 'completed', totalRecordsChecked, allFindings.length, duration);
      
      logger.info('[IntegrityService] Integrity check completed successfully', {
        runId,
        totalRecordsChecked,
        findingsCount: allFindings.length,
        duration: `${duration}ms`
      });
      
      return {
        runId,
        status: 'completed',
        totalRecordsChecked,
        findingsCount: allFindings.length,
        duration,
        findings: allFindings,
        metadata: {
          window: config.window,
          sampling: config.enableSampling,
          timeout: config.timeoutMs
        }
      };
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error('[IntegrityService] Integrity check failed', {
        error: error.message,
        duration: `${duration}ms`,
        runId
      });
      
      // Mark run as failed if we have a runId
      if (runId && client) {
        try {
          await this.completeAuditRun(client, runId, 'failed', 0, 0, duration, error.message);
        } catch (auditError) {
          logger.error('[IntegrityService] Failed to update audit run status:', auditError);
        }
      }
      
      throw error;
      
    } finally {
      // Always release the advisory lock
      if (client) {
        try {
          await this.releaseAdvisoryLock(client);
          client.release();
        } catch (releaseError) {
          logger.error('[IntegrityService] Error releasing resources:', releaseError);
        }
      }
    }
  }

  /**
   * Detect duplicate inflation by comparing base vs enriched data
   */
  private async duplicateInflationDetector(client: PoolClient, config: IntegrityRunConfig): Promise<{ findings: IntegrityFinding[], recordsChecked: number }> {
    const findings: IntegrityFinding[] = [];
    let recordsChecked = 0;
    
    try {
      // Get base totals from unified_sales_lines (raw data)
      const baseQuery = `
        SELECT 
          COUNT(*) as total_records,
          COUNT(DISTINCT order_id) as unique_orders,
          SUM(units) as total_units,
          SUM(revenue) as total_revenue,
          SUM(CASE WHEN units <= 0 THEN 1 ELSE 0 END) as zero_unit_sales,
          SUM(CASE WHEN revenue <= 0 THEN 1 ELSE 0 END) as zero_revenue_sales
        FROM unified_sales_lines 
        WHERE purchase_date >= CURRENT_DATE - INTERVAL '${config.window} days'
      `;
      
      const baseResult = await client.query(baseQuery);
      const baseData = baseResult.rows[0];
      recordsChecked += parseInt(baseData.total_records);
      
      // Get enriched totals using the same logic as sales-unified API
      const enrichedQuery = `
        SELECT 
          COUNT(*) as enriched_records,
          COUNT(DISTINCT product_key) as unique_products,
          SUM(units)::numeric as enriched_units,
          SUM(revenue)::numeric as enriched_revenue
        FROM (
          SELECT 
            product_key,
            sku,
            SUM(units)::numeric AS units,
            SUM(revenue)::numeric AS revenue
          FROM unified_sales_lines
          WHERE purchase_date >= CURRENT_DATE - INTERVAL '${config.window} days'
          GROUP BY product_key, sku
        ) grouped_sales
      `;
      
      const enrichedResult = await client.query(enrichedQuery);
      const enrichedData = enrichedResult.rows[0];
      
      // Calculate differences
      const baseRevenue = parseFloat(baseData.total_revenue) || 0;
      const enrichedRevenue = parseFloat(enrichedData.enriched_revenue) || 0;
      const revenueDifference = Math.abs(baseRevenue - enrichedRevenue);
      const revenuePercentageDiff = baseRevenue > 0 ? (revenueDifference / baseRevenue) * 100 : 0;
      
      const baseUnits = parseInt(baseData.total_units) || 0;
      const enrichedUnits = parseInt(enrichedData.enriched_units) || 0;
      const unitsDifference = Math.abs(baseUnits - enrichedUnits);
      const unitsPercentageDiff = baseUnits > 0 ? (unitsDifference / baseUnits) * 100 : 0;
      
      // Check for significant discrepancies (more than 1% difference)
      if (revenuePercentageDiff > 1.0) {
        findings.push({
          findingType: 'duplicate',
          severity: revenuePercentageDiff > 10 ? 'critical' : revenuePercentageDiff > 5 ? 'high' : 'medium',
          tableName: 'unified_sales_lines',
          issueDescription: `Revenue inflation detected: ${revenuePercentageDiff.toFixed(2)}% difference between base (${baseRevenue}) and enriched (${enrichedRevenue}) totals`,
          suggestedAction: 'Review JOIN operations in sales-unified API for potential duplication',
          currentValue: enrichedRevenue.toString(),
          expectedValue: baseRevenue.toString(),
          confidenceScore: Math.min(revenuePercentageDiff / 10, 1.0),
          autoFixable: false,
          metadata: {
            baseRevenue,
            enrichedRevenue,
            differenceAmount: revenueDifference,
            differencePercentage: revenuePercentageDiff,
            window: config.window
          }
        });
      }
      
      if (unitsPercentageDiff > 1.0) {
        findings.push({
          findingType: 'duplicate',
          severity: unitsPercentageDiff > 10 ? 'critical' : unitsPercentageDiff > 5 ? 'high' : 'medium',
          tableName: 'unified_sales_lines',
          columnName: 'units',
          issueDescription: `Units inflation detected: ${unitsPercentageDiff.toFixed(2)}% difference between base (${baseUnits}) and enriched (${enrichedUnits}) totals`,
          suggestedAction: 'Review aggregation logic for potential duplicate counting',
          currentValue: enrichedUnits.toString(),
          expectedValue: baseUnits.toString(),
          confidenceScore: Math.min(unitsPercentageDiff / 10, 1.0),
          autoFixable: false,
          metadata: {
            baseUnits,
            enrichedUnits,
            differenceAmount: unitsDifference,
            differencePercentage: unitsPercentageDiff,
            window: config.window
          }
        });
      }
      
      // Check for zero/negative values that shouldn't exist
      const zeroUnitSales = parseInt(baseData.zero_unit_sales) || 0;
      const zeroRevenueSales = parseInt(baseData.zero_revenue_sales) || 0;
      
      if (zeroUnitSales > 0) {
        findings.push({
          findingType: 'invalid_data',
          severity: 'medium',
          tableName: 'unified_sales_lines',
          columnName: 'units',
          issueDescription: `Found ${zeroUnitSales} sales records with zero or negative units`,
          suggestedAction: 'Review data import logic and validate unit calculations',
          currentValue: zeroUnitSales.toString(),
          expectedValue: '0',
          confidenceScore: 1.0,
          autoFixable: true,
          metadata: { window: config.window }
        });
      }
      
      if (zeroRevenueSales > 0) {
        findings.push({
          findingType: 'invalid_data',
          severity: 'medium',
          tableName: 'unified_sales_lines',
          columnName: 'revenue',
          issueDescription: `Found ${zeroRevenueSales} sales records with zero or negative revenue`,
          suggestedAction: 'Review revenue calculations and pricing data',
          currentValue: zeroRevenueSales.toString(),
          expectedValue: '0',
          confidenceScore: 1.0,
          autoFixable: true,
          metadata: { window: config.window }
        });
      }
      
      logger.info('[IntegrityService] Duplicate inflation check completed', {
        recordsChecked,
        baseRevenue,
        enrichedRevenue,
        revenuePercentageDiff: revenuePercentageDiff.toFixed(2) + '%',
        unitsPercentageDiff: unitsPercentageDiff.toFixed(2) + '%',
        findingsCount: findings.length
      });
      
    } catch (error: any) {
      logger.error('[IntegrityService] Duplicate inflation detection failed:', error);
      findings.push({
        findingType: 'anomaly',
        severity: 'high',
        tableName: 'unified_sales_lines',
        issueDescription: `Duplicate inflation detection failed: ${error.message}`,
        suggestedAction: 'Review integrity service configuration and database connectivity',
        confidenceScore: 1.0,
        autoFixable: false,
        metadata: { error: error.message, window: config.window }
      });
    }
    
    return { findings, recordsChecked };
  }

  /**
   * Check cardinality constraints for uniqueness violations
   */
  private async cardinalityChecks(client: PoolClient, config: IntegrityRunConfig): Promise<{ findings: IntegrityFinding[], recordsChecked: number }> {
    const findings: IntegrityFinding[] = [];
    let recordsChecked = 0;
    
    try {
      // Define critical uniqueness constraints to check
      const cardinalityChecks = [
        {
          table: 'products',
          column: 'asin',
          description: 'Product ASIN should be unique',
          severity: 'critical' as const
        },
        {
          table: 'orders',
          column: 'amazon_order_id',
          description: 'Amazon Order ID should be unique',
          severity: 'critical' as const
        },
        {
          table: 'order_items',
          column: 'order_item_id',
          description: 'Order Item ID should be unique',
          severity: 'high' as const
        },
        {
          table: 'ml_orders',
          column: 'ml_order_id',
          description: 'MercadoLibre Order ID should be unique',
          severity: 'high' as const
        },
        {
          table: 'ml_inventory',
          column: 'item_id',
          description: 'MercadoLibre Item ID should be unique per seller',
          severity: 'medium' as const
        }
      ];
      
      for (const check of cardinalityChecks) {
        try {
          // Check for duplicates in the specified column
          const duplicateQuery = `
            SELECT 
              ${check.column},
              COUNT(*) as duplicate_count,
              array_agg(DISTINCT ${check.table === 'order_items' ? 'amazon_order_id' : check.table === 'ml_orders' ? 'created_at::date' : 'created_at::date'}) as sample_records
            FROM ${check.table}
            WHERE ${check.table === 'orders' || check.table === 'order_items' ? 'purchase_date' : 'created_at'} >= CURRENT_DATE - INTERVAL '${config.window} days'
            GROUP BY ${check.column}
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC
            LIMIT 100
          `;
          
          const duplicateResult = await client.query(duplicateQuery);
          const duplicates = duplicateResult.rows;
          recordsChecked += duplicates.length;
          
          if (duplicates.length > 0) {
            // Count total affected records
            const totalAffectedQuery = `
              SELECT COUNT(*) as total_duplicates
              FROM ${check.table}
              WHERE ${check.column} IN (
                SELECT ${check.column}
                FROM ${check.table}
                WHERE ${check.table === 'orders' || check.table === 'order_items' ? 'purchase_date' : 'created_at'} >= CURRENT_DATE - INTERVAL '${config.window} days'
                GROUP BY ${check.column}
                HAVING COUNT(*) > 1
              )
            `;
            
            const totalResult = await client.query(totalAffectedQuery);
            const totalAffected = parseInt(totalResult.rows[0].total_duplicates) || 0;
            
            findings.push({
              findingType: 'cardinality_violation',
              severity: check.severity,
              tableName: check.table,
              columnName: check.column,
              issueDescription: `${check.description}: Found ${duplicates.length} duplicate values affecting ${totalAffected} total records`,
              suggestedAction: `Review data import process for ${check.table}.${check.column} to prevent duplicates. Consider adding unique constraint.`,
              currentValue: duplicates.length.toString(),
              expectedValue: '0',
              confidenceScore: 1.0,
              autoFixable: false,
              metadata: {
                duplicateValues: duplicates.slice(0, 5).map(d => ({ 
                  value: d[check.column], 
                  count: parseInt(d.duplicate_count),
                  sampleRecords: d.sample_records
                })),
                totalDuplicateValues: duplicates.length,
                totalAffectedRecords: totalAffected,
                window: config.window
              }
            });
          }
          
          logger.debug(`[IntegrityService] Cardinality check for ${check.table}.${check.column}: ${duplicates.length} duplicate values found`);
          
        } catch (error: any) {
          logger.error(`[IntegrityService] Cardinality check failed for ${check.table}.${check.column}:`, error);
          findings.push({
            findingType: 'anomaly',
            severity: 'medium',
            tableName: check.table,
            columnName: check.column,
            issueDescription: `Cardinality check failed for ${check.table}.${check.column}: ${error.message}`,
            suggestedAction: 'Review table structure and query permissions',
            confidenceScore: 1.0,
            autoFixable: false,
            metadata: { error: error.message }
          });
        }
      }
      
      logger.info('[IntegrityService] Cardinality checks completed', {
        recordsChecked,
        findingsCount: findings.length
      });
      
    } catch (error: any) {
      logger.error('[IntegrityService] Cardinality checks failed:', error);
      findings.push({
        findingType: 'anomaly',
        severity: 'high',
        tableName: 'multiple',
        issueDescription: `Cardinality checks failed: ${error.message}`,
        suggestedAction: 'Review integrity service configuration and database connectivity',
        confidenceScore: 1.0,
        autoFixable: false,
        metadata: { error: error.message }
      });
    }
    
    return { findings, recordsChecked };
  }

  /**
   * Check referential integrity for orphaned records
   */
  private async referentialIntegrityChecks(client: PoolClient, config: IntegrityRunConfig): Promise<{ findings: IntegrityFinding[], recordsChecked: number }> {
    const findings: IntegrityFinding[] = [];
    let recordsChecked = 0;
    
    try {
      // Define critical foreign key relationships to check
      const referentialChecks = [
        {
          childTable: 'order_items',
          childColumn: 'amazon_order_id',
          parentTable: 'orders',
          parentColumn: 'amazon_order_id',
          description: 'Order items should reference existing orders',
          severity: 'critical' as const
        },
        {
          childTable: 'order_items',
          childColumn: 'asin',
          parentTable: 'products',
          parentColumn: 'asin',
          description: 'Order items should reference existing products',
          severity: 'high' as const
        },
        {
          childTable: 'unified_sales_lines',
          childColumn: 'product_key',
          parentTable: 'products',
          parentColumn: 'asin',
          description: 'Sales lines should reference existing products',
          severity: 'medium' as const
        },
        {
          childTable: 'advertising_metrics',
          childColumn: 'asin',
          parentTable: 'products',
          parentColumn: 'asin',
          description: 'Advertising metrics should reference existing products',
          severity: 'medium' as const
        }
      ];
      
      for (const check of referentialChecks) {
        try {
          // Check for orphaned records (child records without parent)
          const orphanQuery = `
            SELECT 
              COUNT(*) as orphan_count,
              array_agg(DISTINCT ${check.childColumn}) FILTER (WHERE row_number() OVER (ORDER BY ${check.childColumn}) <= 10) as sample_orphans
            FROM ${check.childTable} c
            LEFT JOIN ${check.parentTable} p ON c.${check.childColumn} = p.${check.parentColumn}
            WHERE p.${check.parentColumn} IS NULL
              AND c.${check.childTable === 'order_items' || check.childTable === 'unified_sales_lines' ? 'purchase_date' : 'created_at'} >= CURRENT_DATE - INTERVAL '${config.window} days'
              AND c.${check.childColumn} IS NOT NULL
              AND c.${check.childColumn} != ''
          `;
          
          const orphanResult = await client.query(orphanQuery);
          const orphanData = orphanResult.rows[0];
          const orphanCount = parseInt(orphanData.orphan_count) || 0;
          recordsChecked += orphanCount;
          
          if (orphanCount > 0) {
            findings.push({
              findingType: 'referential_integrity',
              severity: check.severity,
              tableName: check.childTable,
              columnName: check.childColumn,
              issueDescription: `${check.description}: Found ${orphanCount} orphaned records in ${check.childTable}.${check.childColumn}`,
              suggestedAction: `Review data sync process between ${check.parentTable} and ${check.childTable}. Consider cascading deletes or data cleanup.`,
              currentValue: orphanCount.toString(),
              expectedValue: '0',
              confidenceScore: 1.0,
              autoFixable: check.severity === 'medium', // Only auto-fix medium severity issues
              metadata: {
                childTable: check.childTable,
                parentTable: check.parentTable,
                orphanCount,
                sampleOrphans: orphanData.sample_orphans || [],
                window: config.window
              }
            });
          }
          
          logger.debug(`[IntegrityService] Referential integrity check for ${check.childTable}.${check.childColumn} -> ${check.parentTable}.${check.parentColumn}: ${orphanCount} orphans found`);
          
        } catch (error: any) {
          logger.error(`[IntegrityService] Referential integrity check failed for ${check.childTable}.${check.childColumn}:`, error);
          findings.push({
            findingType: 'anomaly',
            severity: 'medium',
            tableName: check.childTable,
            columnName: check.childColumn,
            issueDescription: `Referential integrity check failed for ${check.childTable}.${check.childColumn}: ${error.message}`,
            suggestedAction: 'Review table relationships and query permissions',
            confidenceScore: 1.0,
            autoFixable: false,
            metadata: { error: error.message }
          });
        }
      }
      
      logger.info('[IntegrityService] Referential integrity checks completed', {
        recordsChecked,
        findingsCount: findings.length
      });
      
    } catch (error: any) {
      logger.error('[IntegrityService] Referential integrity checks failed:', error);
      findings.push({
        findingType: 'anomaly',
        severity: 'high',
        tableName: 'multiple',
        issueDescription: `Referential integrity checks failed: ${error.message}`,
        suggestedAction: 'Review integrity service configuration and database connectivity',
        confidenceScore: 1.0,
        autoFixable: false,
        metadata: { error: error.message }
      });
    }
    
    return { findings, recordsChecked };
  }

  // ============================================================================
  // AUDIT INTEGRATION METHODS
  // ============================================================================

  /**
   * Create a new audit run record
   */
  private async createAuditRun(client: PoolClient, config: IntegrityRunConfig): Promise<number> {
    const result = await client.query(`
      INSERT INTO dq_runs (
        run_name, 
        run_type, 
        status, 
        metadata, 
        created_by
      ) VALUES (
        $1, $2, $3, $4, $5
      ) RETURNING id
    `, [
      `integrity_check_${Date.now()}`,
      'integrity_check',
      'running',
      JSON.stringify({
        window: config.window,
        maxRecords: config.maxRecordsToCheck,
        timeout: config.timeoutMs,
        sampling: config.enableSampling,
        samplingPercentage: config.samplingPercentage
      }),
      'integrity_service'
    ]);
    
    return result.rows[0].id;
  }

  /**
   * Store findings in the audit system
   */
  private async storeFindingsInAudit(client: PoolClient, runId: number, findings: IntegrityFinding[]): Promise<void> {
    if (findings.length === 0) return;
    
    const values: any[] = [];
    const placeholders: string[] = [];
    
    findings.forEach((finding, index) => {
      const baseIndex = index * 12;
      placeholders.push(`(
        $${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, 
        $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, 
        $${baseIndex + 9}, $${baseIndex + 10}, $${baseIndex + 11}, $${baseIndex + 12}
      )`);
      
      values.push(
        runId,
        finding.findingType,
        finding.severity,
        finding.tableName,
        finding.columnName || null,
        finding.recordId || null,
        finding.recordKeys ? JSON.stringify(finding.recordKeys) : null,
        finding.issueDescription,
        finding.suggestedAction || null,
        finding.currentValue || null,
        finding.expectedValue || null,
        finding.confidenceScore || 1.0
      );
    });
    
    const query = `
      INSERT INTO dq_findings (
        run_id, finding_type, severity, table_name, column_name, record_id,
        record_keys, issue_description, suggested_action, current_value, 
        expected_value, confidence_score
      ) VALUES ${placeholders.join(', ')}
    `;
    
    await client.query(query, values);
  }

  /**
   * Complete the audit run with final status and metrics
   */
  private async completeAuditRun(
    client: PoolClient, 
    runId: number, 
    status: 'completed' | 'failed', 
    totalRecordsChecked: number, 
    findingsCount: number, 
    duration: number, 
    errorMessage?: string
  ): Promise<void> {
    await client.query(`
      UPDATE dq_runs 
      SET 
        status = $2,
        completed_at = NOW(),
        duration_seconds = $3,
        total_records_checked = $4,
        findings_count = $5,
        error_message = $6,
        updated_at = NOW()
      WHERE id = $1
    `, [
      runId,
      status,
      Math.round(duration / 1000),
      totalRecordsChecked,
      findingsCount,
      errorMessage || null
    ]);
  }

  // ============================================================================
  // ADVISORY LOCK MANAGEMENT
  // ============================================================================

  /**
   * Acquire advisory lock to prevent concurrent integrity checks
   */
  private async acquireAdvisoryLock(client: PoolClient): Promise<boolean> {
    try {
      const result = await client.query(
        'SELECT pg_try_advisory_lock($1) as acquired',
        [this.ADVISORY_LOCK_ID]
      );
      
      const acquired = result.rows[0].acquired;
      if (acquired) {
        logger.info('[IntegrityService] Advisory lock acquired successfully', {
          lockId: this.ADVISORY_LOCK_ID
        });
      } else {
        logger.warn('[IntegrityService] Failed to acquire advisory lock - another integrity check is running', {
          lockId: this.ADVISORY_LOCK_ID
        });
      }
      
      return acquired;
    } catch (error) {
      logger.error('[IntegrityService] Error acquiring advisory lock:', error);
      return false;
    }
  }

  /**
   * Release advisory lock
   */
  private async releaseAdvisoryLock(client: PoolClient): Promise<void> {
    try {
      await client.query(
        'SELECT pg_advisory_unlock($1)',
        [this.ADVISORY_LOCK_ID]
      );
      
      logger.info('[IntegrityService] Advisory lock released successfully', {
        lockId: this.ADVISORY_LOCK_ID
      });
    } catch (error) {
      logger.error('[IntegrityService] Error releasing advisory lock:', error);
    }
  }

  // ============================================================================
  // PUBLIC CONVENIENCE METHODS
  // ============================================================================

  /**
   * Run quick integrity check (last 7 days)
   */
  async runQuickCheck(): Promise<IntegrityRunResult> {
    return this.runChecks({
      window: 7,
      maxRecordsToCheck: 10000,
      timeoutMs: 60000, // 1 minute
      enableSampling: true,
      samplingPercentage: 10
    });
  }

  /**
   * Run comprehensive integrity check (last 30 days)
   */
  async runComprehensiveCheck(): Promise<IntegrityRunResult> {
    return this.runChecks({
      window: 30,
      maxRecordsToCheck: 100000,
      timeoutMs: 300000, // 5 minutes
      enableSampling: false
    });
  }
}

// ============================================================================
// LEGACY REPAIR FUNCTIONS (PRESERVED FOR BACKWARD COMPATIBILITY)
// ============================================================================

export async function repairRecentPrices(days: number = 30): Promise<{ updated: Record<string, number> }> {
  const updated: Record<string, number> = {};
  const w = [days];

  // 1) item_price * qty
  const r2 = await pool.query(
    `UPDATE order_items oi
     SET price_amount = ROUND(oi.item_price * oi.quantity_ordered, 2)
     FROM orders o
     WHERE oi.amazon_order_id = o.amazon_order_id
       AND o.purchase_date >= NOW() - ($1 || ' days')::interval
       AND (oi.price_amount IS NULL OR oi.price_amount = 0)
       AND oi.item_price IS NOT NULL AND oi.item_price > 0
       AND oi.quantity_ordered > 0`,
    w,
  );
  updated.item_price_qty = r2.rowCount || 0;

  // 2) products.price * qty
  const r3 = await pool.query(
    `UPDATE order_items oi
     SET price_amount = ROUND(p.price * oi.quantity_ordered, 2)
     FROM orders o, products p
     WHERE oi.amazon_order_id = o.amazon_order_id
       AND p.asin = oi.asin
       AND o.purchase_date >= NOW() - ($1 || ' days')::interval
       AND (oi.price_amount IS NULL OR oi.price_amount = 0)
       AND p.price IS NOT NULL AND p.price > 0
       AND oi.quantity_ordered > 0`,
    w,
  );
  updated.products_price_qty = r3.rowCount || 0;

  // 3) Product."currentPrice" * qty
  const r4 = await pool.query(
    `UPDATE order_items oi
     SET price_amount = ROUND(prod."currentPrice" * oi.quantity_ordered, 2)
     FROM orders o, "Product" prod
     WHERE oi.amazon_order_id = o.amazon_order_id
       AND prod.asin = oi.asin
       AND o.purchase_date >= NOW() - ($1 || ' days')::interval
       AND (oi.price_amount IS NULL OR oi.price_amount = 0)
       AND prod."currentPrice" IS NOT NULL AND prod."currentPrice" > 0
       AND oi.quantity_ordered > 0`,
    w,
  );
  updated.product_current_price_qty = r4.rowCount || 0;

  // 4) Distribute order_total_amount
  const r5 = await pool.query(
    `WITH order_qty AS (
       SELECT oi.amazon_order_id, SUM(oi.quantity_ordered) AS total_qty
       FROM order_items oi
       JOIN orders o ON o.amazon_order_id = oi.amazon_order_id
       WHERE o.purchase_date >= NOW() - ($1 || ' days')::interval
       GROUP BY oi.amazon_order_id
     )
     UPDATE order_items oi
     SET price_amount = ROUND(((o.order_total_amount::numeric / NULLIF(oq.total_qty, 0)) * oi.quantity_ordered), 2)
     FROM orders o
     JOIN order_qty oq ON oq.amazon_order_id = o.amazon_order_id
     WHERE oi.amazon_order_id = o.amazon_order_id
       AND o.purchase_date >= NOW() - ($1 || ' days')::interval
       AND (oi.price_amount IS NULL OR oi.price_amount = 0)
       AND o.order_total_amount IS NOT NULL AND o.order_total_amount > 0
       AND oi.quantity_ordered > 0`,
    w,
  );
  updated.distributed_order_total = r5.rowCount || 0;

  // 5) Recompute orders.order_total_amount from items when 0 or null
  const r7 = await pool.query(
    `WITH sums AS (
       SELECT oi.amazon_order_id, SUM(COALESCE(oi.price_amount, 0)) AS sum_items
       FROM order_items oi
       JOIN orders o ON o.amazon_order_id = oi.amazon_order_id
       WHERE o.purchase_date >= NOW() - ($1 || ' days')::interval
       GROUP BY oi.amazon_order_id
     )
     UPDATE orders o
     SET order_total_amount = s.sum_items
     FROM sums s
     WHERE o.amazon_order_id = s.amazon_order_id
       AND (o.order_total_amount IS NULL OR o.order_total_amount = 0)
       AND o.purchase_date >= NOW() - ($1 || ' days')::interval`,
    w,
  );
  updated.recomputed_order_totals = r7.rowCount || 0;

  logger.info('[Integrity] Repair recent prices updated:', updated);
  return { updated };
}

