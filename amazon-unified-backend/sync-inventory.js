/**
 * Script to sync real inventory data from Amazon SP-API
 * Uses LWA (OAuth 2.0) without SigV4/IAM
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

class InventorySync {
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

  async fetchFBAInventory() {
    try {
      console.log('\n📦 Fetching FBA inventory from Amazon...');
      
      // Get SKUs from order items
      const skuResult = await pool.query(`
        SELECT DISTINCT 
          COALESCE(seller_sku, asin) as sku,
          asin
        FROM order_items
        WHERE asin IS NOT NULL
        ORDER BY sku
        LIMIT 20
      `);

      console.log(`Found ${skuResult.rows.length} SKUs to check`);

      for (const row of skuResult.rows) {
        try {
          console.log(`\nChecking inventory for SKU: ${row.sku} (ASIN: ${row.asin})`);
          
          const url = `${this.baseUrl}/fba/inventory/v1/summaries`;
          
          const response = await axios.get(url, {
            params: {
              granularityType: 'Marketplace',
              granularityId: this.marketplaceId,
              marketplaceIds: this.marketplaceId,
              sellerSkus: row.sku
            },
            headers: {
              'x-amz-access-token': this.accessToken,
              'Accept': 'application/json'
            }
          });

          if (response.data.inventorySummaries && response.data.inventorySummaries.length > 0) {
            const inventory = response.data.inventorySummaries[0];
            const quantity = inventory.inventoryDetails?.fulfillableQuantity || 0;
            
            console.log(`  ✅ Found inventory: ${quantity} units`);
            
            // Update database
            await pool.query(`
              UPDATE products 
              SET 
                inventory_quantity = $1,
                in_stock = $2,
                updated_at = NOW()
              WHERE asin = $3
            `, [quantity, quantity > 0, row.asin]);
            
          } else {
            console.log(`  ℹ️ No inventory data found`);
          }
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 600));
          
        } catch (error) {
          if (error.response?.status === 429) {
            console.log('  ⏳ Rate limited, waiting...');
            await new Promise(resolve => setTimeout(resolve, 5000));
          } else if (error.response?.status === 404) {
            console.log(`  ℹ️ SKU not found in FBA`);
          } else {
            console.error(`  ❌ Error:`, error.response?.data || error.message);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch FBA inventory:', error);
    }
  }

  async fetchCatalogInventory() {
    try {
      console.log('\n📦 Fetching catalog data from Amazon...');
      
      // Get ASINs
      const asinResult = await pool.query(`
        SELECT DISTINCT asin
        FROM products
        WHERE asin IS NOT NULL
        ORDER BY asin
        LIMIT 10
      `);

      console.log(`Found ${asinResult.rows.length} ASINs to check`);

      for (const row of asinResult.rows) {
        try {
          console.log(`\nChecking ASIN: ${row.asin}`);
          
          const url = `${this.baseUrl}/catalog/2022-04-01/items/${row.asin}`;
          
          const response = await axios.get(url, {
            params: {
              marketplaceIds: this.marketplaceId,
              includedData: 'attributes,dimensions,identifiers,productTypes,salesRanks,summaries,relationships,vendorDetails'
            },
            headers: {
              'x-amz-access-token': this.accessToken,
              'Accept': 'application/json'
            }
          });

          if (response.data) {
            console.log(`  ✅ Found catalog data`);
            
            // Extract any available quantity info
            const attrs = response.data.attributes || {};
            
            // Update product info
            const title = response.data.summaries?.[0]?.itemName || 
                         attrs.item_name?.[0]?.value || 
                         `Product ${row.asin}`;
            
            const brand = response.data.summaries?.[0]?.brand ||
                         attrs.brand?.[0]?.value ||
                         'Unknown';
            
            await pool.query(`
              UPDATE products 
              SET 
                title = $1,
                brand = $2,
                updated_at = NOW()
              WHERE asin = $3
            `, [title, brand, row.asin]);
            
            console.log(`  Updated: ${title} (${brand})`);
          }
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 600));
          
        } catch (error) {
          if (error.response?.status === 429) {
            console.log('  ⏳ Rate limited, waiting...');
            await new Promise(resolve => setTimeout(resolve, 5000));
          } else {
            console.error(`  ❌ Error:`, error.response?.status, error.response?.data?.errors?.[0]?.message || error.message);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch catalog data:', error);
    }
  }

  async showSummary() {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_products,
        COUNT(CASE WHEN inventory_quantity > 0 THEN 1 END) as products_with_stock,
        SUM(inventory_quantity) as total_units,
        MIN(inventory_quantity) as min_stock,
        MAX(inventory_quantity) as max_stock,
        AVG(inventory_quantity)::numeric(10,2) as avg_stock
      FROM products
    `);
    
    const products = await pool.query(`
      SELECT asin, title, inventory_quantity, buy_box_seller
      FROM products
      WHERE inventory_quantity > 0
      ORDER BY inventory_quantity DESC
      LIMIT 10
    `);
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 INVENTORY SYNC SUMMARY');
    console.log('='.repeat(80));
    
    const stats = result.rows[0];
    console.log(`Total Products: ${stats.total_products}`);
    console.log(`Products with Stock: ${stats.products_with_stock}`);
    console.log(`Total Units in Stock: ${stats.total_units || 0}`);
    console.log(`Min Stock: ${stats.min_stock || 0}`);
    console.log(`Max Stock: ${stats.max_stock || 0}`);
    console.log(`Average Stock: ${stats.avg_stock || 0}`);
    
    if (products.rows.length > 0) {
      console.log('\n📦 Products with Stock:');
      console.log('-'.repeat(80));
      products.rows.forEach(p => {
        console.log(`${p.asin}: ${p.title}`);
        console.log(`  Stock: ${p.inventory_quantity} units | Seller: ${p.buy_box_seller}`);
      });
    }
  }

  async run() {
    try {
      console.log('🚀 Starting Amazon Inventory Sync');
      console.log('=' .repeat(80));
      
      // Get access token
      await this.getAccessToken();
      
      // Try FBA inventory
      await this.fetchFBAInventory();
      
      // Also fetch catalog data for product details
      await this.fetchCatalogInventory();
      
      // Show summary
      await this.showSummary();
      
      console.log('\n✅ Inventory sync completed!');
      
    } catch (error) {
      console.error('❌ Sync failed:', error);
    } finally {
      await pool.end();
    }
  }
}

// Run the sync
const sync = new InventorySync();
sync.run();