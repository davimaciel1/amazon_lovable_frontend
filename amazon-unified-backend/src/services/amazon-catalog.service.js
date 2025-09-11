const { Pool } = require('pg');
const SPAPIAuthService = require('./sp-api-auth.service');

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || '49.12.191.119',
  port: process.env.DB_PORT || 5456,
  database: process.env.DB_NAME || 'amazon_monitor',
  user: process.env.DB_USER || 'saas',
  password: process.env.DB_PASSWORD || 'saas_password_123'
});

// Marketplace configuration
const MARKETPLACE_US = 'ATVPDKIKX0DER';
const MARKETPLACE_BR = 'A2Q3Y263D00KWC';
const MARKETPLACE_CA = 'A2EUQ1WTGCTBG2';
const MARKETPLACE_MX = 'A1AM78C64UM0Y8';

function getRateConfig() {
  // Either set CATALOG_MAX_RPM or CATALOG_MAX_RPS (RPM preferred)
  const maxRpmEnv = Number(process.env.CATALOG_MAX_RPM || 0);
  const maxRpsEnv = Number(process.env.CATALOG_MAX_RPS || 0);
  let baseRpm = 0;
  if (Number.isFinite(maxRpmEnv) && maxRpmEnv > 0) baseRpm = maxRpmEnv;
  else if (Number.isFinite(maxRpsEnv) && maxRpsEnv > 0) baseRpm = maxRpsEnv * 60;
  else baseRpm = 60; // default 60 requests/min (1 rps)

  const safety = Math.max(0.1, Math.min(1, Number(process.env.CATALOG_SAFETY || 0.8))); // 80% by default
  const allowedRpm = Math.max(1, Math.floor(baseRpm * safety));
  const allowedRps = allowedRpm / 60;
  const minDelayMs = Math.max(100, Math.ceil(1000 / allowedRps));
  return { allowedRpm, allowedRps, minDelayMs, safety };
}

class AmazonCatalogService {
  constructor() {
    this.authService = new SPAPIAuthService();
  }

  /**
   * Get catalog item details including images
   * @param {string} asin - Product ASIN
   * @param {string} marketplaceId - Marketplace ID
   */
  async getCatalogItem(asin, marketplaceId = MARKETPLACE_US) {
    try {
      const result = await this.authService.request({
        path: `/catalog/2022-04-01/items/${asin}`,
        params: {
          marketplaceIds: marketplaceId,
          includedData: 'images,summaries,attributes'
        },
        requiredScopes: ['Product Listing']
      });

      return result;
      
    } catch (error) {
      if (error.message.includes('404')) {
        console.log(`Product not found: ${asin}`);
        return null;
      }
      
      if (error.message.includes('429')) {
        console.log(`Rate limited for ASIN ${asin}, will retry later`);
        throw new Error('RATE_LIMITED');
      }

      console.error(`Error fetching catalog item ${asin}:`, error.message);
      throw error;
    }
  }

  /**
   * Extract image URL and key from catalog response
   */
  extractImageData(catalogData) {
    if (!catalogData?.images?.length) {
      return { imageUrl: null, imageKey: null };
    }

    // The SP-API Catalog v2022-04-01 returns images in this structure:
    // catalogData.images = [ { marketplaceId: 'XXX', images: [...] } ]
    const marketplaceImages = catalogData.images[0];
    
    if (!marketplaceImages?.images?.length) {
      return { imageUrl: null, imageKey: null };
    }

    // Priority: MAIN > PT01 > any variant
    const images = marketplaceImages.images;
    let selectedImage = images.find(img => img.variant === 'MAIN') ||
                        images.find(img => img.variant === 'PT01') ||
                        images[0];

    if (!selectedImage?.link) {
      return { imageUrl: null, imageKey: null };
    }

    const imageUrl = selectedImage.link;
    
    // Extract image key from URL (e.g., "71HFnH5XWEL" from Amazon URL)
    let imageKey = null;
    const match = imageUrl.match(/\/([A-Z0-9]+)\._/i);
    if (match) {
      imageKey = match[1];
    }

    return { imageUrl, imageKey };
  }

  /**
   * Update product images in database
   */
  async updateProductImages(asin, imageData, marketplaceId = MARKETPLACE_US) {
    const { imageUrl, imageKey } = imageData;
    
    if (!imageUrl) {
      console.log(`No image found for ASIN ${asin}`);
      return false;
    }

    try {
      const result = await pool.query(`
        UPDATE products 
        SET 
          image_source_url = $1,
          image_key = $2,
          image_last_checked_at = NOW(),
          marketplace_id = $3
        WHERE asin = $4
      `, [imageUrl, imageKey, marketplaceId, asin]);

      if (result.rowCount > 0) {
        console.log(`✅ Updated image for ASIN ${asin}`);
        return true;
      } else {
        console.log(`⚠️ No product found with ASIN ${asin}`);
        return false;
      }
    } catch (error) {
      console.error(`Error updating image for ${asin}:`, error.message);
      return false;
    }
  }

  /**
   * Process a batch of ASINs
   */
  async processBatch(asins, marketplaceId = MARKETPLACE_US) {
    const rate = getRateConfig();
    let windowStart = Date.now();
    let callsInWindow = 0;
    const results = {
      success: 0,
      failed: 0,
      rateLimited: 0,
      notFound: 0
    };

    for (const asin of asins) {
      try {
        // Check if update is needed
        const checkResult = await pool.query(`
          SELECT asin, image_last_checked_at, image_source_url, image_key
          FROM products 
          WHERE asin = $1
        `, [asin]);

        if (checkResult.rows.length === 0) {
          console.log(`Skipping unknown ASIN: ${asin}`);
          continue;
        }

        const product = checkResult.rows[0];
        const lastChecked = product.image_last_checked_at;
        const hasBasicImage = !!(product.image_source_url);
        const hasKey = !!(product.image_key);
        
        // Skip only if we already have both image URL and key AND it was checked recently
        if (lastChecked && hasBasicImage && hasKey) {
          const daysSinceCheck = (Date.now() - new Date(lastChecked)) / (1000 * 60 * 60 * 24);
          if (daysSinceCheck < 7) {
            console.log(`Skipping ${asin} - already has image and was checked ${Math.floor(daysSinceCheck)} days ago`);
            continue;
          }
        }

        // Rate limit: enforce per-minute ceiling and per-call delay
        const now = Date.now();
        if (now - windowStart >= 60_000) {
          windowStart = now;
          callsInWindow = 0;
        }
        if (callsInWindow >= rate.allowedRpm) {
          const waitMs = 60_000 - (now - windowStart);
          if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));
          windowStart = Date.now();
          callsInWindow = 0;
        }
        // Inter-call delay to keep average under allowedRps
        await new Promise(r => setTimeout(r, rate.minDelayMs));

        // Fetch catalog data
        const catalogData = await this.getCatalogItem(asin, marketplaceId);
        callsInWindow++;
        
        if (!catalogData) {
          results.notFound++;
          continue;
        }

        // Extract and update image
        const imageData = this.extractImageData(catalogData);
        const updated = await this.updateProductImages(asin, imageData, marketplaceId);
        
        if (updated) {
          results.success++;
        } else {
          results.failed++;
        }

        // Small spacing between items (already enforced above), keep a tiny buffer
        await new Promise(resolve => setTimeout(resolve, Math.max(0, Math.floor(rate.minDelayMs * 0.1))));
        
      } catch (error) {
        if (error.message === 'RATE_LIMITED') {
          results.rateLimited++;
          // Back off more aggressively on 429
          await new Promise(resolve => setTimeout(resolve, Math.max(10_000, rate.minDelayMs * 10)));
        } else {
          console.error(`Error processing ${asin}:`, error.message);
          results.failed++;
        }
      }
    }

    return results;
  }

  /**
   * Update all products without valid images
   */
  async updateAllMissingImages(limit = 50) {
    const rate = getRateConfig();
    try {
      console.log('🔍 Finding products with missing or outdated images...');
      
      // Cap this run's batch size to the safe per-minute allowance
      const safeLimit = Math.max(1, Math.min(Number(limit) || 1, rate.allowedRpm));
      console.log(`[RateLimit] allowedRps=${rate.allowedRps.toFixed(2)} allowedRpm=${rate.allowedRpm} safety=${rate.safety} batchCap=${safeLimit}`);

      const result = await pool.query(`
        SELECT DISTINCT ON (asin, marketplace_id)
          asin,
          marketplace_id,
          image_last_checked_at
        FROM products 
        WHERE (
          image_source_url IS NULL 
          OR image_key IS NULL 
          OR image_last_checked_at IS NULL
          OR image_last_checked_at < NOW() - INTERVAL '14 days'
        )
        AND asin IS NOT NULL
        ORDER BY asin, marketplace_id, image_last_checked_at ASC NULLS FIRST
        LIMIT $1
      `, [safeLimit]);

      if (result.rows.length === 0) {
        console.log('✅ All products have recent images');
        return { totalProcessed: 0 };
      }

      console.log(`📦 Processing ${result.rows.length} products...`);
      
      // Group by marketplace
      const byMarketplace = {};
      for (const row of result.rows) {
        const mp = row.marketplace_id || MARKETPLACE_US;
        if (!byMarketplace[mp]) byMarketplace[mp] = [];
        byMarketplace[mp].push(row.asin);
      }

      let totalResults = {
        success: 0,
        failed: 0,
        rateLimited: 0,
        notFound: 0
      };

      // Process each marketplace
      for (const [marketplaceId, asins] of Object.entries(byMarketplace)) {
        console.log(`\n🌍 Processing ${asins.length} products for marketplace ${marketplaceId}...`);
        const results = await this.processBatch(asins, marketplaceId);
        
        totalResults.success += results.success;
        totalResults.failed += results.failed;
        totalResults.rateLimited += results.rateLimited;
        totalResults.notFound += results.notFound;
      }

      console.log('\n📊 Update Summary:');
      console.log(`  ✅ Success: ${totalResults.success}`);
      console.log(`  ❌ Failed: ${totalResults.failed}`);
      console.log(`  ⏳ Rate Limited: ${totalResults.rateLimited}`);
      console.log(`  🔍 Not Found: ${totalResults.notFound}`);
      
      return {
        totalProcessed: result.rows.length,
        ...totalResults
      };
      
    } catch (error) {
      console.error('Error in updateAllMissingImages:', error);
      throw error;
    }
  }
}

module.exports = AmazonCatalogService;