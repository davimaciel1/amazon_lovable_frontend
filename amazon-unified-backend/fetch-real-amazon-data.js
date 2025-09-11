/**
 * Fetch REAL data from Amazon SP-API
 * NO estimates, NO fake data - ONLY real Amazon data
 */

require('dotenv').config();
const axios = require('axios');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'app',
  user: process.env.DB_USER || 'app',
  password: process.env.DB_PASSWORD || '',
});

class AmazonRealDataFetcher {
  constructor() {
    this.refreshToken = process.env.SP_API_REFRESH_TOKEN;
    this.clientId = process.env.SP_API_CLIENT_ID;
    this.clientSecret = process.env.SP_API_CLIENT_SECRET;
    this.sellerId = process.env.AMAZON_SELLER_ID;
    this.marketplaceId = 'ATVPDKIKX0DER'; // US marketplace
    this.baseUrl = 'https://sellingpartnerapi-na.amazon.com';
    this.accessToken = '';
  }

  async getAccessToken() {
    try {
      console.log('🔑 Getting LWA access token...');
      const response = await axios.post(
        'https://api.amazon.com/auth/o2/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.accessToken = response.data.access_token;
      console.log('✅ Access token obtained');
      return this.accessToken;
    } catch (error) {
      console.error('❌ Failed to get access token:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Fetch REAL inventory from Amazon FBA
   */
  async fetchRealInventory() {
    console.log('\n📦 Fetching REAL inventory from Amazon FBA...');
    console.log('Only data that Amazon returns will be saved - NO estimates\n');
    
    try {
      // Get all SKUs from database
      const skuResult = await pool.query(`
        SELECT DISTINCT 
          seller_sku,
          asin
        FROM order_items
        WHERE seller_sku IS NOT NULL
        ORDER BY seller_sku
      `);

      console.log(`Found ${skuResult.rows.length} SKUs to check with Amazon\n`);
      
      let realDataCount = 0;
      let noDataCount = 0;

      for (const row of skuResult.rows) {
        try {
          const url = `${this.baseUrl}/fba/inventory/v1/summaries`;
          
          console.log(`Checking SKU ${row.seller_sku}...`);
          
          const response = await axios.get(url, {
            params: {
              granularityType: 'Marketplace',
              granularityId: this.marketplaceId,
              marketplaceIds: this.marketplaceId,
              sellerSkus: row.seller_sku,
              details: true
            },
            headers: {
              'x-amz-access-token': this.accessToken,
              'Accept': 'application/json'
            }
          });

          if (response.data?.inventorySummaries?.length > 0) {
            const inventory = response.data.inventorySummaries[0];
            const realQuantity = inventory.inventoryDetails?.fulfillableQuantity || 0;
            
            console.log(`  ✅ REAL DATA: ${realQuantity} units`);
            
            // Update with REAL data only
            await pool.query(`
              UPDATE products 
              SET 
                inventory_quantity = $1,
                in_stock = $2,
                updated_at = NOW()
              WHERE asin = $3
            `, [realQuantity, realQuantity > 0, row.asin]);
            
            realDataCount++;
          } else {
            console.log(`  ⚠️ No data from Amazon - keeping at 0`);
            noDataCount++;
          }
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 600));
          
        } catch (error) {
          if (error.response?.status === 404) {
            console.log(`  ℹ️ SKU not found in Amazon - keeping at 0`);
            noDataCount++;
          } else if (error.response?.status === 429) {
            console.log('  ⏳ Rate limited, waiting...');
            await new Promise(resolve => setTimeout(resolve, 5000));
          } else {
            console.log(`  ❌ Error: ${error.response?.status || error.message}`);
            noDataCount++;
          }
        }
      }
      
      console.log('\n' + '='.repeat(80));
      console.log('REAL DATA FETCH RESULTS:');
      console.log(`✅ Products with REAL Amazon data: ${realDataCount}`);
      console.log(`⚠️ Products without data (kept at 0): ${noDataCount}`);
      console.log('='.repeat(80));
      
    } catch (error) {
      console.error('Failed to fetch inventory:', error);
    }
  }

  /**
   * Fetch REAL product details from Amazon Catalog API
   */
  async fetchRealProductDetails() {
    console.log('\n📦 Fetching REAL product details from Amazon Catalog API...');
    console.log('Only data that Amazon returns will be saved - NO estimates\n');
    
    try {
      const asinResult = await pool.query(`
        SELECT DISTINCT asin
        FROM products
        WHERE asin IS NOT NULL
        ORDER BY asin
        LIMIT 10
      `);

      for (const row of asinResult.rows) {
        try {
          console.log(`Fetching ASIN ${row.asin}...`);
          
          const url = `${this.baseUrl}/catalog/2022-04-01/items/${row.asin}`;
          
          const response = await axios.get(url, {
            params: {
              marketplaceIds: this.marketplaceId,
              includedData: 'attributes,dimensions,identifiers,productTypes,salesRanks,summaries'
            },
            headers: {
              'x-amz-access-token': this.accessToken,
              'Accept': 'application/json'
            }
          });

          if (response.data) {
            // Only save REAL data from Amazon
            const realTitle = response.data.summaries?.[0]?.itemName;
            const realBrand = response.data.summaries?.[0]?.brand;
            const realManufacturer = response.data.summaries?.[0]?.manufacturer;
            
            if (realTitle || realBrand) {
              console.log(`  ✅ REAL DATA: ${realTitle || 'No title'} (${realBrand || 'No brand'})`);
              
              await pool.query(`
                UPDATE products 
                SET 
                  title = COALESCE($1, title),
                  brand = COALESCE($2, brand),
                  updated_at = NOW()
                WHERE asin = $3
              `, [realTitle, realBrand, row.asin]);
            } else {
              console.log(`  ⚠️ No product details from Amazon`);
            }
          }
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 600));
          
        } catch (error) {
          if (error.response?.status === 403) {
            console.log(`  ❌ Access denied - need proper permissions`);
          } else if (error.response?.status === 404) {
            console.log(`  ⚠️ Product not found in Amazon catalog`);
          } else {
            console.log(`  ❌ Error: ${error.response?.status || error.message}`);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch product details:', error);
    }
  }

  async showCurrentData() {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_products,
        COUNT(CASE WHEN inventory_quantity > 0 THEN 1 END) as products_with_real_stock,
        SUM(inventory_quantity) as total_real_units
      FROM products
    `);
    
    const products = await pool.query(`
      SELECT asin, title, inventory_quantity
      FROM products
      WHERE inventory_quantity > 0
      ORDER BY inventory_quantity DESC
    `);
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 CURRENT REAL DATA STATUS');
    console.log('='.repeat(80));
    
    const stats = result.rows[0];
    console.log(`Total Products: ${stats.total_products}`);
    console.log(`Products with REAL stock data: ${stats.products_with_real_stock}`);
    console.log(`Total REAL units (from Amazon): ${stats.total_real_units || 0}`);
    
    if (products.rows.length > 0) {
      console.log('\n📦 Products with REAL Amazon stock:');
      console.log('-'.repeat(80));
      products.rows.forEach(p => {
        console.log(`${p.asin}: ${p.title}`);
        console.log(`  REAL Stock from Amazon: ${p.inventory_quantity} units`);
      });
    } else {
      console.log('\n⚠️ No products have real stock data from Amazon yet');
      console.log('This means either:');
      console.log('1. Amazon API returned 0 for all products');
      console.log('2. Products are not in FBA inventory');
      console.log('3. Need different API permissions');
    }
  }

  async run() {
    try {
      console.log('🚀 Amazon REAL Data Fetcher');
      console.log('=' .repeat(80));
      console.log('NO estimates, NO fake data - ONLY real Amazon data\n');
      
      // Get access token
      await this.getAccessToken();
      
      // Fetch REAL inventory
      await this.fetchRealInventory();
      
      // Fetch REAL product details
      await this.fetchRealProductDetails();
      
      // Show what real data we have
      await this.showCurrentData();
      
      console.log('\n✅ Finished fetching REAL data from Amazon');
      console.log('📝 All data shown is REAL from Amazon API - no estimates');
      
    } catch (error) {
      console.error('❌ Failed:', error);
    } finally {
      await pool.end();
    }
  }
}

// Run the real data fetcher
const fetcher = new AmazonRealDataFetcher();
fetcher.run();