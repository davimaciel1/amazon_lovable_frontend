/**
 * Database Credentials Service
 * Fetches SP-API credentials from database instead of environment variables
 */

const { Pool } = require('pg');

class DatabaseCredentialsService {
  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || '49.12.191.119',
      port: process.env.DB_PORT || 5456,
      database: process.env.DB_NAME || 'amazon_monitor',
      user: process.env.DB_USER || 'saas',
      password: process.env.DB_PASSWORD || 'saas_password_123'
    });
    
    this.credentials = null;
    this.lastFetch = null;
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache
  }
  
  /**
   * Get all credentials from database
   */
  async getCredentials() {
    // Check cache
    if (this.credentials && this.lastFetch && (Date.now() - this.lastFetch < this.CACHE_TTL)) {
      return this.credentials;
    }
    
    try {
      const result = await this.pool.query(`
        SELECT credential_key, credential_value 
        FROM amazon_credentials 
        WHERE is_active = true
      `);
      
      // Convert to object
      this.credentials = {};
      result.rows.forEach(row => {
        this.credentials[row.credential_key] = row.credential_value;
      });
      
      this.lastFetch = Date.now();
      
      console.log('✅ Loaded credentials from database');
      console.log('  Available keys:', Object.keys(this.credentials).join(', '));
      
      return this.credentials;
      
    } catch (error) {
      console.error('❌ Failed to load credentials from database:', error.message);
      throw error;
    }
  }
  
  /**
   * Get specific credential
   */
  async getCredential(key) {
    const credentials = await this.getCredentials();
    return credentials[key];
  }
  
  /**
   * Get SP-API credentials
   */
  async getSPAPICredentials() {
    const credentials = await this.getCredentials();
    
    return {
      clientId: credentials.AMAZON_CLIENT_ID || process.env.LWA_CLIENT_ID || process.env.SP_API_CLIENT_ID,
      clientSecret: credentials.AMAZON_CLIENT_SECRET || process.env.LWA_CLIENT_SECRET || process.env.SP_API_CLIENT_SECRET,
      refreshToken: credentials.AMAZON_REFRESH_TOKEN || process.env.LWA_REFRESH_TOKEN || process.env.SP_API_REFRESH_TOKEN,
      sellerId: credentials.seller_id || process.env.AMAZON_SELLER_ID,
      region: credentials.region || process.env.SPAPI_REGION || 'NA',
      marketplaceId: credentials.marketplace_id || process.env.MARKETPLACE_IDS || 'ATVPDKIKX0DER',
      endpoint: credentials.endpoint || null
    };
  }
  
  /**
   * Update credential in database
   */
  async updateCredential(key, value) {
    try {
      const result = await this.pool.query(`
        UPDATE amazon_credentials 
        SET credential_value = $1, updated_at = NOW() 
        WHERE credential_key = $2
      `, [value, key]);
      
      if (result.rowCount > 0) {
        // Clear cache
        this.credentials = null;
        console.log(`✅ Updated credential: ${key}`);
        return true;
      }
      
      return false;
      
    } catch (error) {
      console.error(`❌ Failed to update credential ${key}:`, error.message);
      throw error;
    }
  }
  
  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

module.exports = DatabaseCredentialsService;