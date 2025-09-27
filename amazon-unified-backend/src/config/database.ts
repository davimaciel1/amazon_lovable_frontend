/**
 * Database Configuration
 * CRITICAL: This configuration connects to our production PostgreSQL database
 * DO NOT MODIFY without approval - All Amazon data flows through this connection
 */

import { Pool, PoolConfig } from 'pg';
import { logger } from '../utils/logger';

// Database configuration - Force using external Coolify PostgreSQL
// OVERRIDE: Ignore system DATABASE_URL and use individual configs
const dbConfig: PoolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'app',
  user: process.env.DB_USER || 'app',
  password: process.env.DB_PASSWORD || '',
  ssl: false, // Coolify PostgreSQL doesn't support SSL
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

// Create connection pool
export const pool = new Pool(dbConfig);

// Pool error handling
pool.on('error', (err: Error) => {
  logger.error('Unexpected database pool error:', err);
  // Don't exit application, try to recover
});

// Test database connection
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    
    logger.info('✅ Database connection successful:', {
      host: dbConfig.host,
      database: dbConfig.database,
      timestamp: result.rows[0].now
    });
    
    // Log critical table row counts
    await logCriticalTableCounts();
    
    return true;
  } catch (error) {
    logger.error('❌ Database connection failed:', error);
    return false;
  }
}

// Log critical table counts for monitoring
async function logCriticalTableCounts(): Promise<void> {
  try {
    const criticalTables = [
      'orders',
      'products', 
      'order_items',
      'advertising_campaigns',
      'advertising_metrics'
    ];
    
    for (const table of criticalTables) {
      try {
        const result = await pool.query(`SELECT COUNT(*) FROM ${table}`);
        const count = parseInt(result.rows[0].count);
        logger.info(`📊 Table ${table}: ${count} rows`);
      } catch (error) {
        // Table might not exist yet
        logger.warn(`⚠️ Table ${table} not accessible`);
      }
    }
  } catch (error) {
    logger.error('Error getting table counts:', error);
  }
}

// Graceful shutdown
export async function closeDatabaseConnection(): Promise<void> {
  try {
    await pool.end();
    logger.info('Database connection pool closed');
  } catch (error) {
    logger.error('Error closing database pool:', error);
  }
}
