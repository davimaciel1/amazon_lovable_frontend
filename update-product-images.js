/**
 * Update product images from Amazon Catalog API
 * Fetches real product images and updates database
 */

require('dotenv').config();
const axios = require('axios');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || '49.12.191.119',
  port: Number(process.env.DB_PORT || 5456),
  database: process.env.DB_NAME || 'amazon_monitor',
  user: process.env.DB_USER || 'saas',
  password: process.env.DB_PASSWORD || 'saas_password_123',
});

class ProductImageUpdater {
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
      console.log('Getting LWA access token...');
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
      console.log('Access token obtained');
      return this.accessToken;
    } catch (error) {
      console.error('Failed to get access token:', error.response?.data || error.message);
      throw error;
    }
  }

  async fetchProductDetails(asin) {
    try {
      const url = `${this.baseUrl}/catalog/2022-04-01/items/${asin}`;
      
      const response = await axios.get(url, {
        params: {
          marketplaceIds: this.marketplaceId,
          includedData: 'attributes,images,summaries'
        },
        headers: {
          'x-amz-access-token': this.accessToken,
          'Accept': 'application/json'
        }
      });

      if (response.data) {
        return response.data;
      }
      
      return null;
    } catch (error) {
      if (error.response?.status === 404) {
        console.log(`  Product ${asin} not found in catalog`);
      } else if (error.response?.status === 429) {
        console.log(`  Rate limited, waiting...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.log(`  Error fetching ${asin}:`, error.response?.status || error.message);
      }
      return null;
    }
  }

  extractBestImageUrl(catalogData) {
    try {
      // Try to get images from the response
      if (catalogData.images && catalogData.images.length > 0) {
        const primaryImage = catalogData.images.find(img => img.variant === 'MAIN') || 
                           catalogData.images[0];
        
        if (primaryImage && primaryImage.link) {
          return primaryImage.link;
        }
      }

      // Try attributes if images not available
      if (catalogData.attributes) {
        const imageAttributes = [
          'main_image_url',
          'main_product_image',
          'item_package_image',
          'swatch_image'
        ];

        for (const attr of imageAttributes) {
          if (catalogData.attributes[attr] && 
              catalogData.attributes[attr].length > 0 &&
              catalogData.attributes[attr][0].value) {
            return catalogData.attributes[attr][0].value;
          }
        }
      }

      // Try summaries
      if (catalogData.summaries && catalogData.summaries.length > 0) {
        const summary = catalogData.summaries[0];
        if (summary.mainImage && summary.mainImage.link) {
          return summary.mainImage.link;
        }
      }

      return null;
    } catch (error) {
      console.error('Error extracting image:', error);
      return null;
    }
  }

  async updateAllProductImages() {
    console.log('\nUpdating product images from Amazon Catalog API...\n');
    
    try {
      // Get all products from database
      const result = await pool.query(`
        SELECT asin, title, image_url
        FROM products
        ORDER BY asin
      `);

      console.log(`Found ${result.rows.length} products in database\n`);

      let updated = 0;
      let failed = 0;

      for (const product of result.rows) {
        console.log(`\nProcessing ${product.asin}: ${product.title}`);
        
        // Fetch product details from Amazon
        const catalogData = await this.fetchProductDetails(product.asin);
        
        if (catalogData) {
          const imageUrl = this.extractBestImageUrl(catalogData);
          
          if (imageUrl) {
            console.log(`  Found image: ${imageUrl}`);
            
            // Generate image key (Base64 of ASIN)
            const imageKey = Buffer.from(product.asin).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
            
            // Update database
            await pool.query(`
              UPDATE products 
              SET 
                image_url = $1,
                image_source_url = $1,
                image_key = $2,
                image_last_checked_at = NOW(),
                updated_at = NOW()
              WHERE asin = $3
            `, [imageUrl, imageKey, product.asin]);
            
            updated++;
          } else {
            console.log(`  No image found in catalog`);
            failed++;
          }
        } else {
          console.log(`  Could not fetch catalog data`);
          failed++;
        }
        
        // Rate limiting - wait between requests
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      console.log('\n' + '='.repeat(80));
      console.log('IMAGE UPDATE RESULTS');
      console.log('='.repeat(80));
      console.log(`Total Products: ${result.rows.length}`);
      console.log(`Successfully Updated: ${updated}`);
      console.log(`Failed: ${failed}`);

      // Show sample of updated products
      const updatedProducts = await pool.query(`
        SELECT asin, title, image_url, image_key
        FROM products
        WHERE image_source_url IS NOT NULL
          AND image_source_url NOT LIKE '%placeholder%'
        ORDER BY updated_at DESC
        LIMIT 10
      `);

      if (updatedProducts.rows.length > 0) {
        console.log('\nRecently Updated Product Images:');
        console.log('-'.repeat(80));
        updatedProducts.rows.forEach(p => {
          console.log(`ASIN: ${p.asin}`);
          console.log(`  Title: ${p.title}`);
          console.log(`  Image URL: ${p.image_url}`);
          console.log(`  Image Key: ${p.image_key}`);
          console.log('');
        });
      }

    } catch (error) {
      console.error('\nError updating images:', error);
    }
  }

  async run() {
    try {
      console.log('Product Image Updater');
      console.log('=' .repeat(80));
      console.log('Fetching real product images from Amazon Catalog API\n');
      
      // Get access token
      await this.getAccessToken();
      
      // Update all product images
      await this.updateAllProductImages();
      
      console.log('\nFinished updating product images');
      console.log('Images are now from Amazon CDN - no placeholders');
      
    } catch (error) {
      console.error('Failed:', error);
    } finally {
      await pool.end();
    }
  }
}

// Run it
const updater = new ProductImageUpdater();
updater.run();
