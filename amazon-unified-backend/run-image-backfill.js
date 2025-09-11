#!/usr/bin/env node

/**
 * SP-API Image Backfill Script
 * Populates database with real product images from Amazon Catalog API
 */

require('dotenv').config();
const SPAPIAuthService = require('./src/services/sp-api-auth.service');
const AmazonCatalogService = require('./src/services/amazon-catalog.service');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || '49.12.191.119',
  port: process.env.DB_PORT || 5456,
  database: process.env.DB_NAME || 'amazon_monitor',
  user: process.env.DB_USER || 'saas',
  password: process.env.DB_PASSWORD || 'saas_password_123'
});

async function runBackfill() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('         SP-API Product Image Backfill                 ');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`📅 Started: ${new Date().toISOString()}\n`);

  try {
    // Step 1: Test SP-API connection
    console.log('1️⃣ Testing SP-API Connection...');
    const authService = new SPAPIAuthService();
    const connected = await authService.testConnection();
    
    if (!connected) {
      console.error('❌ Cannot connect to SP-API. Please check credentials.');
      console.log('\nRequired environment variables:');
      console.log('  LWA_CLIENT_ID or SP_API_CLIENT_ID');
      console.log('  LWA_CLIENT_SECRET or SP_API_CLIENT_SECRET');
      console.log('  LWA_REFRESH_TOKEN or SP_API_REFRESH_TOKEN');
      console.log('\nOptional:');
      console.log('  SPAPI_REGION (NA/EU/FE) - default: NA');
      console.log('  MARKETPLACE_IDS - default: ATVPDKIKX0DER,A2Q3Y263D00KWC');
      process.exit(1);
    }
    
    // Step 2: Find products needing images
    console.log('\n2️⃣ Finding products needing image updates...');
    
    const result = await pool.query(`
      SELECT DISTINCT asin, marketplace_id, image_last_checked_at
      FROM products 
      WHERE asin IS NOT NULL
        AND asin != ''
        AND (
          image_source_url IS NULL 
          OR image_source_url = ''
          OR image_last_checked_at IS NULL
          OR image_last_checked_at < NOW() - INTERVAL '14 days'
        )
      ORDER BY image_last_checked_at ASC NULLS FIRST
      LIMIT 100
    `);
    
    if (result.rows.length === 0) {
      console.log('✅ All products have recent images!');
      await pool.end();
      return;
    }
    
    console.log(`📦 Found ${result.rows.length} products to update`);
    
    // Step 3: Process each product
    console.log('\n3️⃣ Fetching images from Amazon Catalog API...\n');
    
    const catalogService = new AmazonCatalogService();
    const stats = {
      success: 0,
      notFound: 0,
      rateLimited: 0,
      failed: 0
    };
    
    for (let i = 0; i < result.rows.length; i++) {
      const { asin, marketplace_id } = result.rows[i];
      const marketplaceId = marketplace_id || 'ATVPDKIKX0DER';
      
      process.stdout.write(`[${i + 1}/${result.rows.length}] ${asin} ... `);
      
      try {
        // Get catalog item
        const catalogData = await catalogService.getCatalogItem(asin, marketplaceId);
        
        if (!catalogData) {
          stats.notFound++;
          console.log('❌ Not found');
          continue;
        }
        
        // Extract image data
        const imageData = catalogService.extractImageData(catalogData);
        
        if (imageData.imageUrl) {
          // Update database
          const updated = await catalogService.updateProductImages(asin, imageData, marketplaceId);
          
          if (updated) {
            stats.success++;
            console.log(`✅ Updated (${imageData.imageKey || 'URL only'})`);
          } else {
            stats.failed++;
            console.log('⚠️ Update failed');
          }
        } else {
          stats.notFound++;
          console.log('❌ No image in catalog');
        }
        
        // Rate limiting: wait 600ms between requests
        await new Promise(resolve => setTimeout(resolve, 600));
        
      } catch (error) {
        if (error.message === 'RATE_LIMITED') {
          stats.rateLimited++;
          console.log('⏳ Rate limited');
          // Wait longer before continuing
          await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
          stats.failed++;
          console.log(`❌ Error: ${error.message}`);
        }
      }
    }
    
    // Step 4: Verify results
    console.log('\n4️⃣ Verifying database update...');
    
    const verifyResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(image_source_url) as with_url,
        COUNT(image_key) as with_key,
        COUNT(CASE WHEN image_last_checked_at > NOW() - INTERVAL '1 hour' THEN 1 END) as just_updated
      FROM products
      WHERE asin IS NOT NULL
    `);
    
    const verify = verifyResult.rows[0];
    const coverage = ((verify.with_url / verify.total) * 100).toFixed(1);
    
    console.log(`\n📊 Final Statistics:`);
    console.log(`  Total products: ${verify.total}`);
    console.log(`  With images: ${verify.with_url} (${coverage}%)`);
    console.log(`  Just updated: ${verify.just_updated}`);
    console.log(`\n  Processing results:`);
    console.log(`    ✅ Success: ${stats.success}`);
    console.log(`    ❌ Not found: ${stats.notFound}`);
    console.log(`    ⏳ Rate limited: ${stats.rateLimited}`);
    console.log(`    ⚠️ Failed: ${stats.failed}`);
    
    // Step 5: Test image proxy
    console.log('\n5️⃣ Testing image proxy endpoint...');
    
    const sampleResult = await pool.query(`
      SELECT asin, image_source_url 
      FROM products 
      WHERE image_source_url IS NOT NULL 
      LIMIT 1
    `);
    
    if (sampleResult.rows.length > 0) {
      const sample = sampleResult.rows[0];
      const base64Id = Buffer.from(sample.asin).toString('base64');
      console.log(`  Test ASIN: ${sample.asin}`);
      console.log(`  Base64 ID: ${base64Id}`);
      console.log(`  Proxy URL: /app/product-images/${base64Id}.jpg`);
      console.log(`  Source: ${sample.image_source_url.substring(0, 60)}...`);
    }
    
    // Success criteria
    console.log('\n✅ Acceptance Criteria:');
    if (coverage >= 95) {
      console.log(`  ✓ ≥95% of ASINs have image_source_url (${coverage}%)`);
    } else if (coverage >= 90) {
      console.log(`  ⚠️ ${coverage}% coverage (target: ≥95%)`);
    } else {
      console.log(`  ❌ Only ${coverage}% coverage (target: ≥95%)`);
    }
    
    console.log('\n📝 Next Steps:');
    console.log('1. Check frontend at http://localhost:8083/sales');
    console.log('2. Verify images are loading from proxy');
    console.log('3. Schedule daily updates: npm run scheduler:images');
    console.log('4. Monitor proxy metrics for cache hits');
    
  } catch (error) {
    console.error('\n❌ Backfill failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
  
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`📅 Completed: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════');
}

// Handle interruption
process.on('SIGINT', () => {
  console.log('\n\n⚠️ Backfill interrupted by user');
  pool.end();
  process.exit(130);
});

// Run backfill
runBackfill().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});