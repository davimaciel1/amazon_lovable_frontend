/**
 * Fetch REAL inventory using Amazon Listings API
 * This should work for both FBA and FBM inventory
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

class ListingsInventoryFetcher {
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
   * Fetch inventory using Listings API
   */
  async fetchListingsInventory() {
    console.log('\n📦 Fetching REAL inventory from Amazon Listings API...');
    console.log('This should show your 2 products with inventory\n');
    
    try {
      // First, get all your listings
      const url = `${this.baseUrl}/listings/2021-08-01/items`;
      
      console.log('Getting all listings for seller:', this.sellerId);
      
      const response = await axios.get(url, {
        params: {
          sellerId: this.sellerId,
          marketplaceIds: this.marketplaceId,
          includedData: 'summaries,attributes,fulfillmentAvailability,procurement'
        },
        headers: {
          'x-amz-access-token': this.accessToken,
          'Accept': 'application/json'
        }
      });

      if (response.data && response.data.items) {
        console.log(`✅ Found ${response.data.items.length} listings\n`);
        
        for (const item of response.data.items) {
          const sku = item.sku;
          const asin = item.summaries?.[0]?.asin || item.asin;
          const title = item.summaries?.[0]?.itemName || 'Unknown';
          const quantity = item.fulfillmentAvailability?.[0]?.quantity || 0;
          
          console.log(`SKU: ${sku} | ASIN: ${asin}`);
          console.log(`  Title: ${title}`);
          console.log(`  ✅ REAL Inventory: ${quantity} units`);
          
          if (quantity > 0) {
            console.log(`  📦 THIS PRODUCT HAS INVENTORY!`);
            
            // Update database with real inventory
            await pool.query(`
              UPDATE products 
              SET 
                inventory_quantity = $1,
                in_stock = true,
                sku = $2,
                title = $3,
                updated_at = NOW()
              WHERE asin = $4
            `, [quantity, sku, title, asin]);
          }
          console.log('');
        }
      } else {
        console.log('No listings found. Trying different approach...\n');
        
        // Try fetching by SKU
        await this.fetchBySKU();
      }
      
    } catch (error) {
      if (error.response?.status === 400) {
        console.log('Listings API failed. Trying individual SKU approach...\n');
        await this.fetchBySKU();
      } else {
        console.error('Error fetching listings:', error.response?.data || error.message);
      }
    }
  }

  /**
   * Fetch inventory by individual SKU
   */
  async fetchBySKU() {
    console.log('📦 Fetching inventory by individual SKU...\n');
    
    const skuResult = await pool.query(`
      SELECT DISTINCT 
        seller_sku as sku,
        asin
      FROM order_items
      WHERE seller_sku IS NOT NULL
      ORDER BY seller_sku
      LIMIT 20
    `);

    let foundInventory = 0;
    
    for (const row of skuResult.rows) {
      try {
        const url = `${this.baseUrl}/listings/2021-08-01/items/${this.sellerId}/${row.sku}`;
        
        console.log(`Checking SKU: ${row.sku}`);
        
        const response = await axios.get(url, {
          params: {
            marketplaceIds: this.marketplaceId,
            includedData: 'summaries,fulfillmentAvailability'
          },
          headers: {
            'x-amz-access-token': this.accessToken,
            'Accept': 'application/json'
          }
        });

        if (response.data) {
          const quantity = response.data.fulfillmentAvailability?.[0]?.quantity || 0;
          const title = response.data.summaries?.[0]?.itemName || 'Unknown';
          
          if (quantity > 0) {
            console.log(`  ✅ FOUND INVENTORY: ${quantity} units`);
            console.log(`  Title: ${title}`);
            foundInventory++;
            
            // Update database
            await pool.query(`
              UPDATE products 
              SET 
                inventory_quantity = $1,
                in_stock = true,
                title = $2,
                updated_at = NOW()
              WHERE asin = $3 OR sku = $4
            `, [quantity, title, row.asin, row.sku]);
          } else {
            console.log(`  No inventory`);
          }
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 600));
        
      } catch (error) {
        if (error.response?.status === 404) {
          console.log(`  SKU not found in listings`);
        } else {
          console.log(`  Error: ${error.response?.status || error.message}`);
        }
      }
    }
    
    console.log(`\n✅ Found ${foundInventory} products with inventory`);
  }

  /**
   * Try Products API for inventory
   */
  async fetchProductsAPI() {
    console.log('\n📦 Trying Products API for inventory...\n');
    
    try {
      const asinResult = await pool.query(`
        SELECT DISTINCT asin, sku
        FROM products
        WHERE asin IS NOT NULL
        ORDER BY asin
        LIMIT 10
      `);

      for (const row of asinResult.rows) {
        try {
          const url = `${this.baseUrl}/products/pricing/v0/items/${row.asin}/offers`;
          
          console.log(`Checking ASIN ${row.asin} for offers...`);
          
          const response = await axios.get(url, {
            params: {
              MarketplaceId: this.marketplaceId,
              ItemCondition: 'New'
            },
            headers: {
              'x-amz-access-token': this.accessToken,
              'Accept': 'application/json'
            }
          });

          if (response.data?.payload?.Offers) {
            const offers = response.data.payload.Offers;
            console.log(`  Found ${offers.length} offers`);
            
            // Find your offer
            const yourOffer = offers.find(o => o.SellerId === this.sellerId);
            if (yourOffer) {
              console.log(`  ✅ Your listing found!`);
              // Note: Offers API doesn't directly show inventory quantity
            }
          }
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 600));
          
        } catch (error) {
          console.log(`  Error: ${error.response?.status || error.message}`);
        }
      }
    } catch (error) {
      console.error('Products API error:', error);
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
    console.log('📊 REAL INVENTORY RESULTS');
    console.log('='.repeat(80));
    
    const stats = result.rows[0];
    console.log(`Total Products: ${stats.total_products}`);
    console.log(`Products WITH inventory: ${stats.products_with_inventory}`);
    console.log(`Total units in stock: ${stats.total_units || 0}`);
    
    if (products.rows.length > 0) {
      console.log('\n📦 Products with REAL inventory:');
      console.log('-'.repeat(80));
      products.rows.forEach(p => {
        console.log(`ASIN: ${p.asin} | SKU: ${p.sku || 'N/A'}`);
        console.log(`  ${p.title}`);
        console.log(`  📦 REAL Stock: ${p.inventory_quantity} units`);
      });
    } else {
      console.log('\n⚠️ No products with inventory found yet');
      console.log('You mentioned 2 products have inventory.');
      console.log('Please check:');
      console.log('1. Are they listed with the seller ID: ' + this.sellerId);
      console.log('2. Are they in the US marketplace: ' + this.marketplaceId);
      console.log('3. Are the SKUs in the order_items table correct?');
    }
  }

  async run() {
    try {
      console.log('🚀 Fetching REAL Inventory from Amazon');
      console.log('=' .repeat(80));
      console.log('Looking for your 2 products with inventory...\n');
      
      // Get access token
      await this.getAccessToken();
      
      // Try Listings API first
      await this.fetchListingsInventory();
      
      // Also try Products API
      // await this.fetchProductsAPI();
      
      // Show results
      await this.showResults();
      
      console.log('\n✅ Finished checking for real inventory');
      console.log('📝 Only showing REAL data from Amazon - no estimates');
      
    } catch (error) {
      console.error('❌ Failed:', error);
    } finally {
      await pool.end();
    }
  }
}

// Run it
const fetcher = new ListingsInventoryFetcher();
fetcher.run();