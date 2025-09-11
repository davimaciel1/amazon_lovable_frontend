/**
 * Fetch REAL inventory using Inventory Summaries API
 * This should work for both FBA and FBM products
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

class InventorySummariesFetcher {
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
   * Try FBA Inventory Summaries v1
   */
  async fetchInventorySummaries() {
    console.log('\n📦 Fetching inventory summaries from Amazon...');
    console.log('Looking for your 2 products with inventory\n');
    
    try {
      const url = `${this.baseUrl}/fba/inventory/v1/summaries`;
      
      console.log('Fetching inventory for marketplace:', this.marketplaceId);
      console.log('Seller ID:', this.sellerId);
      
      const response = await axios.get(url, {
        params: {
          granularityType: 'Marketplace',
          granularityId: this.marketplaceId,
          marketplaceIds: this.marketplaceId
        },
        headers: {
          'x-amz-access-token': this.accessToken,
          'Accept': 'application/json'
        }
      });

      if (response.data && response.data.inventorySummaries) {
        console.log(`✅ Found ${response.data.inventorySummaries.length} inventory summaries\n`);
        
        let foundWithStock = 0;
        
        for (const item of response.data.inventorySummaries) {
          const sku = item.sellerSku;
          const asin = item.asin;
          const fnSku = item.fnSku;
          const totalQuantity = item.totalQuantity || 0;
          const fulfillableQuantity = item.inventoryDetails?.fulfillableQuantity || 0;
          const unfulfillableQuantity = item.inventoryDetails?.unfulfillableQuantity || 0;
          const reservedQuantity = item.inventoryDetails?.reservedQuantity?.totalReservedQuantity || 0;
          
          if (totalQuantity > 0 || fulfillableQuantity > 0) {
            console.log(`✅ FOUND INVENTORY!`);
            console.log(`  SKU: ${sku}`);
            console.log(`  ASIN: ${asin}`);
            console.log(`  FN-SKU: ${fnSku}`);
            console.log(`  Total Quantity: ${totalQuantity}`);
            console.log(`  Fulfillable: ${fulfillableQuantity}`);
            console.log(`  Unfulfillable: ${unfulfillableQuantity}`);
            console.log(`  Reserved: ${reservedQuantity}`);
            console.log('');
            
            foundWithStock++;
            
            // Update database with real inventory
            await pool.query(`
              UPDATE products 
              SET 
                inventory_quantity = $1,
                in_stock = true,
                sku = $2,
                updated_at = NOW()
              WHERE asin = $3
            `, [fulfillableQuantity || totalQuantity, sku, asin]);
          }
        }
        
        console.log(`\n✅ Found ${foundWithStock} products with inventory`);
        
        if (foundWithStock === 0) {
          console.log('\n📝 Checking if products are FBM (Fulfilled by Merchant)...');
          await this.checkMerchantFulfilledInventory();
        }
      } else {
        console.log('No inventory summaries returned\n');
        await this.checkMerchantFulfilledInventory();
      }
      
    } catch (error) {
      console.error('Error fetching inventory summaries:', error.response?.data || error.message);
      
      if (error.response?.status === 403) {
        console.log('\n📝 Access denied to FBA inventory. Checking merchant-fulfilled inventory...');
        await this.checkMerchantFulfilledInventory();
      }
    }
  }

  /**
   * Check for merchant-fulfilled (FBM) inventory
   */
  async checkMerchantFulfilledInventory() {
    console.log('\n📦 Checking for Merchant-Fulfilled (FBM) inventory...\n');
    
    try {
      // Get all SKUs from database
      const skuResult = await pool.query(`
        SELECT DISTINCT 
          COALESCE(sku, seller_sku) as sku,
          asin
        FROM (
          SELECT sku, asin FROM products WHERE sku IS NOT NULL
          UNION
          SELECT seller_sku as sku, asin FROM order_items WHERE seller_sku IS NOT NULL
        ) combined
        WHERE sku IS NOT NULL
        ORDER BY sku
        LIMIT 100
      `);

      console.log(`Found ${skuResult.rows.length} SKUs to check\n`);

      // For FBM, we need to check the Listings API or use a different approach
      // Let's try to get product availability from the Catalog API
      for (const row of skuResult.rows) {
        try {
          const url = `${this.baseUrl}/catalog/2022-04-01/items`;
          
          const response = await axios.get(url, {
            params: {
              marketplaceIds: this.marketplaceId,
              sellerId: this.sellerId,
              skus: row.sku,
              includedData: 'attributes,dimensions,identifiers,productTypes,salesRanks,summaries'
            },
            headers: {
              'x-amz-access-token': this.accessToken,
              'Accept': 'application/json'
            }
          });

          if (response.data && response.data.items && response.data.items.length > 0) {
            const item = response.data.items[0];
            console.log(`SKU ${row.sku}: Found in catalog`);
            
            // Check if there's any availability info
            const attributes = item.attributes || {};
            if (attributes.fulfillment_availability) {
              console.log(`  ✅ Has availability data:`, attributes.fulfillment_availability);
            }
          }
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          if (error.response?.status !== 404) {
            console.log(`  Error checking SKU ${row.sku}:`, error.response?.status || error.message);
          }
        }
      }
      
    } catch (error) {
      console.error('Error checking merchant inventory:', error);
    }
  }

  async showResults() {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_products,
        COUNT(CASE WHEN inventory_quantity > 0 THEN 1 END) as products_with_inventory,
        SUM(inventory_quantity) as total_units
      FROM products
    `);
    
    const products = await pool.query(`
      SELECT asin, sku, title, inventory_quantity
      FROM products
      WHERE inventory_quantity > 0
      ORDER BY inventory_quantity DESC
    `);
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 INVENTORY RESULTS');
    console.log('='.repeat(80));
    
    const stats = result.rows[0];
    console.log(`Total Products: ${stats.total_products}`);
    console.log(`Products WITH inventory: ${stats.products_with_inventory}`);
    console.log(`Total units in stock: ${stats.total_units || 0}`);
    
    if (products.rows.length > 0) {
      console.log('\n📦 Products with inventory:');
      console.log('-'.repeat(80));
      products.rows.forEach(p => {
        console.log(`ASIN: ${p.asin} | SKU: ${p.sku || 'N/A'}`);
        console.log(`  ${p.title}`);
        console.log(`  Stock: ${p.inventory_quantity} units`);
      });
    } else {
      console.log('\n⚠️ No products with inventory found');
      console.log('If you have 2 products with inventory, they might be:');
      console.log('1. Merchant-fulfilled (FBM) - not showing in FBA inventory');
      console.log('2. In a different marketplace');
      console.log('3. Listed under a different seller account');
    }
  }

  async run() {
    try {
      console.log('🚀 Inventory Summaries Fetcher');
      console.log('=' .repeat(80));
      console.log('Checking both FBA and FBM inventory...\n');
      
      // Get access token
      await this.getAccessToken();
      
      // Try to fetch inventory
      await this.fetchInventorySummaries();
      
      // Show results
      await this.showResults();
      
      console.log('\n✅ Finished checking inventory');
      
    } catch (error) {
      console.error('❌ Failed:', error);
    } finally {
      await pool.end();
    }
  }
}

// Run it
const fetcher = new InventorySummariesFetcher();
fetcher.run();