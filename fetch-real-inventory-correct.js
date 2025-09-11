/**
 * Fetch REAL inventory using correct FBA Inventory API parameters
 * Based on official documentation
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

class RealInventoryFetcher {
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
   * Fetch inventory using CORRECT API parameters as per documentation
   */
  async fetchInventory() {
    console.log('\n📦 Fetching REAL inventory from Amazon FBA API...');
    console.log('Using correct parameters as per documentation\n');
    
    try {
      // First, get all SKUs from our database
      const skuResult = await pool.query(`
        SELECT DISTINCT 
          seller_sku,
          asin
        FROM order_items
        WHERE seller_sku IS NOT NULL
        GROUP BY seller_sku, asin
        ORDER BY seller_sku
      `);

      console.log(`Found ${skuResult.rows.length} SKUs in database\n`);

      // Now fetch inventory for ALL products at once (without sellerSkus filter first)
      const url = `${this.baseUrl}/fba/inventory/v1/summaries`;
      
      console.log('Fetching ALL inventory for marketplace:', this.marketplaceId);
      console.log('Using parameters:');
      console.log('  granularityType: Marketplace');
      console.log('  granularityId:', this.marketplaceId);
      console.log('  marketplaceIds:', this.marketplaceId);
      console.log('  details: true\n');
      
      const response = await axios.get(url, {
        params: {
          granularityType: 'Marketplace',
          granularityId: this.marketplaceId,
          marketplaceIds: this.marketplaceId,
          details: true  // Get detailed inventory breakdown
        },
        headers: {
          'x-amz-access-token': this.accessToken,
          'Accept': 'application/json'
        }
      });

      if (response.data && response.data.payload && response.data.payload.inventorySummaries) {
        const summaries = response.data.payload.inventorySummaries;
        console.log(`✅ Found ${summaries.length} items with inventory data\n`);
        
        let foundWithStock = 0;
        
        for (const item of summaries) {
          const asin = item.asin;
          const sellerSku = item.sellerSku;
          const fnSku = item.fnSku;
          const condition = item.condition;
          const productName = item.productName;
          
          // Get detailed quantities
          const inventoryDetails = item.inventoryDetails || {};
          const fulfillableQuantity = inventoryDetails.fulfillableQuantity || 0;
          const totalReservedQuantity = inventoryDetails.reservedQuantity?.totalReservedQuantity || 0;
          const inboundWorking = inventoryDetails.inboundWorkingQuantity || 0;
          const inboundShipped = inventoryDetails.inboundShippedQuantity || 0;
          const inboundReceiving = inventoryDetails.inboundReceivingQuantity || 0;
          const unfulfillableQuantity = inventoryDetails.unfulfillableQuantity?.totalUnfulfillableQuantity || 0;
          const totalQuantity = item.totalQuantity || 0;
          
          if (fulfillableQuantity > 0 || totalQuantity > 0) {
            console.log(`✅ FOUND PRODUCT WITH INVENTORY!`);
            console.log(`  ASIN: ${asin}`);
            console.log(`  Seller SKU: ${sellerSku}`);
            console.log(`  FN SKU: ${fnSku}`);
            console.log(`  Product Name: ${productName}`);
            console.log(`  Condition: ${condition}`);
            console.log(`  📦 Fulfillable (Available): ${fulfillableQuantity} units`);
            console.log(`  📦 Reserved: ${totalReservedQuantity} units`);
            console.log(`  📦 Inbound Working: ${inboundWorking} units`);
            console.log(`  📦 Inbound Shipped: ${inboundShipped} units`);
            console.log(`  📦 Inbound Receiving: ${inboundReceiving} units`);
            console.log(`  📦 Unfulfillable: ${unfulfillableQuantity} units`);
            console.log(`  📦 TOTAL: ${totalQuantity} units`);
            console.log('  ' + '─'.repeat(60));
            
            foundWithStock++;
            
            // Update database with REAL inventory
            await pool.query(`
              UPDATE products 
              SET 
                inventory_quantity = $1,
                in_stock = $2,
                sku = $3,
                title = COALESCE($4, title),
                updated_at = NOW()
              WHERE asin = $5
            `, [fulfillableQuantity, fulfillableQuantity > 0, sellerSku, productName, asin]);
            
            // Also update by SKU if no ASIN match
            await pool.query(`
              UPDATE products 
              SET 
                inventory_quantity = $1,
                in_stock = $2,
                asin = COALESCE($3, asin),
                title = COALESCE($4, title),
                updated_at = NOW()
              WHERE sku = $5 AND inventory_quantity = 0
            `, [fulfillableQuantity, fulfillableQuantity > 0, asin, productName, sellerSku]);
          }
        }
        
        console.log(`\n✅ Found ${foundWithStock} products with inventory`);
        
        if (foundWithStock === 0) {
          console.log('\n⚠️ No products with inventory found');
          console.log('This could mean:');
          console.log('1. All inventory is currently at 0');
          console.log('2. Products are Merchant-Fulfilled (FBM) not FBA');
          console.log('3. Need to check a different marketplace');
        }
      } else {
        console.log('No inventory data in response');
        console.log('Response:', JSON.stringify(response.data, null, 2));
      }
      
    } catch (error) {
      console.error('\n❌ Error fetching inventory:', error.response?.data || error.message);
      
      if (error.response?.status === 403) {
        console.log('\n⚠️ Access Denied (403)');
        console.log('Please check:');
        console.log('1. Your app has "Amazon Fulfillment" or "Product Listing" role');
        console.log('2. The seller has authorized these permissions');
      } else if (error.response?.status === 400) {
        console.log('\n⚠️ Bad Request (400)');
        console.log('Check the parameters are correct');
      }
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
    console.log('📊 REAL INVENTORY RESULTS IN DATABASE');
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
      console.log('\n⚠️ No products with inventory in database');
    }
  }

  async run() {
    try {
      console.log('🚀 Real Inventory Fetcher (Using Correct API)');
      console.log('=' .repeat(80));
      console.log('Following official SP-API documentation\n');
      
      // Get access token
      await this.getAccessToken();
      
      // Fetch inventory with correct parameters
      await this.fetchInventory();
      
      // Show results
      await this.showResults();
      
      console.log('\n✅ Finished fetching REAL inventory');
      console.log('📝 Only showing data returned by Amazon API - no estimates');
      
    } catch (error) {
      console.error('❌ Failed:', error);
    } finally {
      await pool.end();
    }
  }
}

// Run it
const fetcher = new RealInventoryFetcher();
fetcher.run();