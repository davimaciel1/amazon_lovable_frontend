#!/usr/bin/env node

/**
 * Query Mercado Livre API to obtain correct MLB item IDs for SKUs
 * 
 * This script:
 * 1. Uses existing ML API credentials to authenticate
 * 2. Searches for products by seller_sku for each target SKU
 * 3. Validates results by comparing titles/descriptions
 * 4. Outputs correct mappings to verify before implementation
 * 
 * Target SKUs: IPAS01, IPAS04, IPP-PV-02
 * Expected: IPAS01 should map to "MLBU3406999311" (not "MLB5677833500")
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Database connection - use same pattern as other services
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Target SKUs to search for
const TARGET_SKUS = ['IPAS01', 'IPAS04', 'IPP-PV-02'];

// Current incorrect mappings (for comparison)
const CURRENT_MAPPINGS = {
  'IPAS01': {
    mlb: 'MLB5677833500',
    image: 'https://http2.mlstatic.com/D_746268-MLB91917127844_092025-O.jpg'
  },
  'IPAS04': {
    mlb: 'MLB5321963088',
    image: 'https://http2.mlstatic.com/D_658745-MLB91044369481_082025-O.jpg'
  },
  'IPP-PV-02': {
    mlb: 'MLB5308377982',
    image: 'https://http2.mlstatic.com/D_711283-MLB87635691989_072025-O.jpg'
  }
};

class MLSkuMapper {
  constructor() {
    this.accessToken = null;
    this.accessTokenExpiry = null;
    this.results = [];
  }

  /**
   * Get ML credentials from database or environment
   */
  async getCredentials() {
    try {
      const res = await pool.query(
        `SELECT credential_key, credential_value FROM ml_credentials WHERE is_active = true`
      );
      const map = {};
      for (const r of res.rows) map[r.credential_key] = r.credential_value;

      const clientId = map.ML_CLIENT_ID || process.env.ML_CLIENT_ID;
      const clientSecret = map.ML_CLIENT_SECRET || process.env.ML_CLIENT_SECRET;
      const refreshToken = map.ML_REFRESH_TOKEN;
      const sellerId = map.ML_SELLER_ID || map.ML_USER_ID;

      if (!clientId || !clientSecret || !refreshToken || !sellerId) {
        throw new Error('Missing Mercado Livre credentials (ML_CLIENT_ID/ML_CLIENT_SECRET/ML_REFRESH_TOKEN/ML_SELLER_ID)');
      }
      return { clientId, clientSecret, refreshToken, sellerId };
    } catch (error) {
      console.error('❌ Error getting credentials:', error.message);
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(force = false) {
    if (!force && this.accessToken && this.accessTokenExpiry && Date.now() < this.accessTokenExpiry) {
      return this.accessToken;
    }

    console.log('🔄 Refreshing ML access token...');
    const { clientId, clientSecret, refreshToken } = await this.getCredentials();

    const params = new URLSearchParams();
    params.set('grant_type', 'refresh_token');
    params.set('client_id', clientId);
    params.set('client_secret', clientSecret);
    params.set('refresh_token', refreshToken);

    const resp = await axios.post('https://api.mercadolibre.com/oauth/token', params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
      validateStatus: () => true,
    });

    if (resp.status !== 200) {
      throw new Error(`OAuth token refresh failed: HTTP ${resp.status}: ${resp.statusText}`);
    }

    const data = resp.data || {};
    this.accessToken = data.access_token;
    const expiresInSec = Number(data.expires_in || 0);
    this.accessTokenExpiry = Date.now() + Math.max(0, (expiresInSec - 60) * 1000);

    console.log('✅ Access token refreshed successfully');
    return this.accessToken;
  }

  /**
   * Get access token with fallback refresh
   */
  async getAccessToken() {
    try {
      return await this.refreshAccessToken(false);
    } catch (e) {
      console.log('⚠️ Failed cached ML access token, forcing refresh');
      return await this.refreshAccessToken(true);
    }
  }

  /**
   * Search for items using seller items endpoint
   */
  async searchSellerItems(sellerId, accessToken) {
    console.log(`🔍 Fetching all seller items for seller: ${sellerId}`);
    
    const itemIds = [];
    let offset = 0;
    const limit = 50;

    try {
      for (let page = 0; page < 10; page++) { // Limit pages for safety
        const url = `https://api.mercadolibre.com/users/${sellerId}/items/search?status=active&search_type=scan&limit=${limit}&offset=${offset}`;
        
        const resp = await axios.get(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 30000,
          validateStatus: () => true,
        });

        if (resp.status === 401) {
          await this.refreshAccessToken(true);
          continue;
        }

        if (resp.status !== 200) {
          console.log(`⚠️ Search items HTTP ${resp.status}: ${resp.statusText}`);
          break;
        }

        const results = resp.data.results || [];
        if (results.length === 0) break;
        
        itemIds.push(...results);
        console.log(`📄 Page ${page + 1}: Found ${results.length} items (total: ${itemIds.length})`);
        
        const paging = resp.data.paging || {};
        if (!paging.total || offset + limit >= paging.total) break;
        
        offset += limit;
        await new Promise(resolve => setTimeout(resolve, 200)); // Rate limiting
      }
    } catch (error) {
      console.error('❌ Error fetching seller items:', error.message);
    }

    console.log(`✅ Total items found: ${itemIds.length}`);
    return itemIds;
  }

  /**
   * Get detailed information for items by their IDs
   */
  async fetchItemsDetails(itemIds, accessToken) {
    console.log(`📋 Fetching details for ${itemIds.length} items...`);
    const items = [];
    const batchSize = 20;

    for (let i = 0; i < itemIds.length; i += batchSize) {
      const batch = itemIds.slice(i, i + batchSize);
      const idsParam = batch.join(',');
      
      try {
        const url = `https://api.mercadolibre.com/items?ids=${idsParam}`;
        
        const resp = await axios.get(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 30000,
          validateStatus: () => true,
        });

        if (resp.status === 401) {
          await this.refreshAccessToken(true);
          continue;
        }

        if (resp.status !== 200) {
          console.log(`⚠️ Items details HTTP ${resp.status}: ${resp.statusText}`);
          continue;
        }

        const responses = resp.data || [];
        
        for (const itemResp of responses) {
          if (itemResp.code === 200 && itemResp.body) {
            items.push(itemResp.body);
          }
        }

        console.log(`📦 Batch ${Math.floor(i/batchSize) + 1}: Processed ${batch.length} items`);
        await new Promise(resolve => setTimeout(resolve, 300)); // Rate limiting
      } catch (error) {
        console.error(`❌ Error fetching items batch ${i}-${i + batchSize}:`, error.message);
      }
    }

    console.log(`✅ Total item details fetched: ${items.length}`);
    return items;
  }

  /**
   * Search for items that match target SKUs
   */
  findMatchingItems(items, targetSkus) {
    console.log(`🎯 Searching for items matching SKUs: ${targetSkus.join(', ')}`);
    const matches = {};

    for (const item of items) {
      const itemId = item.id;
      const title = item.title || '';
      const sellerCustomField = item.seller_custom_field || '';
      const variations = item.variations || [];

      // Check main item for SKU match
      for (const sku of targetSkus) {
        const skuUpper = sku.toUpperCase();
        
        // Check if seller_custom_field matches
        if (sellerCustomField.toUpperCase() === skuUpper) {
          if (!matches[sku]) matches[sku] = [];
          matches[sku].push({
            item_id: itemId,
            title: title,
            match_type: 'seller_custom_field',
            match_value: sellerCustomField,
            permalink: item.permalink || '',
            variations: variations.length,
            thumbnail: item.thumbnail || '',
            status: item.status || '',
            site_id: item.site_id || ''
          });
        }

        // Check if title contains SKU
        if (title.toUpperCase().includes(skuUpper)) {
          if (!matches[sku]) matches[sku] = [];
          matches[sku].push({
            item_id: itemId,
            title: title,
            match_type: 'title_contains',
            match_value: title,
            permalink: item.permalink || '',
            variations: variations.length,
            thumbnail: item.thumbnail || '',
            status: item.status || '',
            site_id: item.site_id || ''
          });
        }
      }

      // Check variations for SKU match
      for (const variation of variations) {
        const variationSku = variation.seller_custom_field || '';
        
        for (const sku of targetSkus) {
          const skuUpper = sku.toUpperCase();
          
          if (variationSku.toUpperCase() === skuUpper) {
            if (!matches[sku]) matches[sku] = [];
            matches[sku].push({
              item_id: itemId,
              variation_id: variation.id,
              title: title,
              match_type: 'variation_seller_custom_field',
              match_value: variationSku,
              permalink: item.permalink || '',
              variations: variations.length,
              thumbnail: variation.picture_ids?.[0] || item.thumbnail || '',
              status: item.status || '',
              site_id: item.site_id || ''
            });
          }
        }
      }
    }

    return matches;
  }

  /**
   * Validate matches by getting additional details and comparing with expected titles
   */
  async validateMatches(matches, accessToken) {
    console.log('🔍 Validating matches with additional API calls...');
    
    const expectedTitles = {
      'IPAS01': ['arame', 'solda', 'mig', 'tubular', '0.8mm', '1kg', 'ippax'],
      'IPAS04': ['arame', 'solda', 'mig', 'tubular', '0.9mm', '1kg', 'ippax'],
      'IPP-PV-02': ['chapa', 'perfurada', 'perfurado', 'pvc', 'vazada']
    };

    for (const [sku, items] of Object.entries(matches)) {
      console.log(`\n🔍 Validating ${items.length} matches for SKU: ${sku}`);
      
      for (const item of items) {
        const keywords = expectedTitles[sku] || [];
        const title = item.title.toLowerCase();
        const matchCount = keywords.filter(keyword => title.includes(keyword.toLowerCase())).length;
        const matchPercentage = keywords.length > 0 ? (matchCount / keywords.length) * 100 : 0;
        
        item.title_match_score = matchPercentage;
        item.matched_keywords = keywords.filter(keyword => title.includes(keyword.toLowerCase()));
        
        console.log(`  📋 ${item.item_id}: "${item.title}"`);
        console.log(`     Match: ${item.match_type} = "${item.match_value}"`);
        console.log(`     Title match: ${matchCount}/${keywords.length} keywords (${matchPercentage.toFixed(1)}%)`);
        console.log(`     Status: ${item.status} | Variations: ${item.variations}`);
        
        // Get additional item details if needed
        try {
          if (item.item_id) {
            const resp = await axios.get(`https://api.mercadolibre.com/items/${item.item_id}`, {
              headers: { Authorization: `Bearer ${accessToken}` },
              timeout: 10000,
              validateStatus: () => true,
            });
            
            if (resp.status === 200 && resp.data) {
              item.detailed_info = {
                price: resp.data.price || 0,
                currency_id: resp.data.currency_id || '',
                available_quantity: resp.data.available_quantity || 0,
                sold_quantity: resp.data.sold_quantity || 0,
                category_id: resp.data.category_id || '',
                listing_type_id: resp.data.listing_type_id || '',
                condition: resp.data.condition || ''
              };
            }
            
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          console.log(`     ⚠️ Could not fetch additional details: ${error.message}`);
        }
      }
    }
    
    return matches;
  }

  /**
   * Generate output reports
   */
  generateReports(matches) {
    console.log('\n📊 FINAL RESULTS SUMMARY');
    console.log('=' .repeat(80));
    
    const correctedMappings = {};
    const report = {
      timestamp: new Date().toISOString(),
      search_results: matches,
      current_mappings: CURRENT_MAPPINGS,
      recommended_mappings: {},
      issues_found: []
    };

    for (const [sku, items] of Object.entries(matches)) {
      console.log(`\n🏷️  SKU: ${sku}`);
      console.log(`   Current mapping: ${CURRENT_MAPPINGS[sku]?.mlb || 'none'}`);
      
      if (items.length === 0) {
        console.log('   ❌ No matches found!');
        report.issues_found.push(`No ML items found for SKU: ${sku}`);
        continue;
      }

      // Sort by match score and prefer exact seller_custom_field matches
      const sortedItems = items.sort((a, b) => {
        if (a.match_type === 'seller_custom_field' && b.match_type !== 'seller_custom_field') return -1;
        if (b.match_type === 'seller_custom_field' && a.match_type !== 'seller_custom_field') return 1;
        return (b.title_match_score || 0) - (a.title_match_score || 0);
      });

      const bestMatch = sortedItems[0];
      console.log(`   ✅ Best match: ${bestMatch.item_id}`);
      console.log(`      Title: "${bestMatch.title}"`);
      console.log(`      Match type: ${bestMatch.match_type}`);
      console.log(`      Title match score: ${(bestMatch.title_match_score || 0).toFixed(1)}%`);
      console.log(`      Status: ${bestMatch.status}`);
      
      correctedMappings[sku] = {
        mlb: bestMatch.item_id,
        title: bestMatch.title,
        match_type: bestMatch.match_type,
        title_match_score: bestMatch.title_match_score,
        permalink: bestMatch.permalink,
        thumbnail: bestMatch.thumbnail,
        status: bestMatch.status
      };

      report.recommended_mappings[sku] = correctedMappings[sku];
      
      // Check if this is different from current mapping
      if (CURRENT_MAPPINGS[sku]?.mlb !== bestMatch.item_id) {
        console.log(`   🔄 CHANGE NEEDED: ${CURRENT_MAPPINGS[sku]?.mlb || 'none'} → ${bestMatch.item_id}`);
        report.issues_found.push(`SKU ${sku}: mapping should change from ${CURRENT_MAPPINGS[sku]?.mlb || 'none'} to ${bestMatch.item_id}`);
      } else {
        console.log('   ✅ Current mapping is correct');
      }

      if (sortedItems.length > 1) {
        console.log(`   📋 Alternative matches (${sortedItems.length - 1}):`);
        for (let i = 1; i < Math.min(3, sortedItems.length); i++) {
          const alt = sortedItems[i];
          console.log(`      ${alt.item_id}: "${alt.title}" (${(alt.title_match_score || 0).toFixed(1)}%)`);
        }
      }
    }

    return { correctedMappings, report };
  }

  /**
   * Save results to files
   */
  async saveResults(correctedMappings, report) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Save corrected mappings (for use in code)
    const mappingsFile = path.join(__dirname, `ml-sku-mappings-${timestamp}.json`);
    await fs.promises.writeFile(mappingsFile, JSON.stringify(correctedMappings, null, 2));
    console.log(`\n💾 Corrected mappings saved to: ${mappingsFile}`);
    
    // Save full report (for analysis)
    const reportFile = path.join(__dirname, `ml-sku-report-${timestamp}.json`);
    await fs.promises.writeFile(reportFile, JSON.stringify(report, null, 2));
    console.log(`📋 Full report saved to: ${reportFile}`);
    
    // Save as TypeScript constant (for easy integration)
    const tsContent = `// Generated ML SKU mappings - ${new Date().toISOString()}
export const ML_SKU_MAPPING = ${JSON.stringify(correctedMappings, null, 2)};
`;
    const tsFile = path.join(__dirname, `ml-sku-mappings-${timestamp}.ts`);
    await fs.promises.writeFile(tsFile, tsContent);
    console.log(`🔧 TypeScript mapping saved to: ${tsFile}`);

    return { mappingsFile, reportFile, tsFile };
  }

  /**
   * Main execution function
   */
  async run() {
    try {
      console.log('🚀 Starting ML SKU Mapping Query');
      console.log('Target SKUs:', TARGET_SKUS.join(', '));
      console.log('Expected correction: IPAS01 should map to MLBU3406999311\n');

      // Get credentials and authenticate
      const { sellerId } = await this.getCredentials();
      const accessToken = await this.getAccessToken();
      
      console.log(`🏪 Seller ID: ${sellerId}`);
      console.log(`🔐 Access token obtained\n`);

      // Search for all seller items
      const itemIds = await this.searchSellerItems(sellerId, accessToken);
      if (itemIds.length === 0) {
        throw new Error('No items found for seller');
      }

      // Get detailed information for all items
      const items = await this.fetchItemsDetails(itemIds, accessToken);
      if (items.length === 0) {
        throw new Error('No item details could be fetched');
      }

      // Find items matching target SKUs
      const matches = this.findMatchingItems(items, TARGET_SKUS);
      
      // Validate matches
      const validatedMatches = await this.validateMatches(matches, accessToken);
      
      // Generate reports and recommendations
      const { correctedMappings, report } = this.generateReports(validatedMatches);
      
      // Save results to files
      const files = await this.saveResults(correctedMappings, report);
      
      console.log('\n🎉 ML SKU mapping query completed successfully!');
      console.log('\nNext steps:');
      console.log('1. Review the generated mappings and report files');
      console.log('2. Verify the recommended changes are correct');
      console.log('3. Update the ML_SKU_MAPPING in images.routes.ts');
      console.log('4. Test the new image URLs');
      
      return {
        success: true,
        correctedMappings,
        report,
        files
      };

    } catch (error) {
      console.error('\n❌ Error during ML SKU mapping query:', error.message);
      throw error;
    } finally {
      if (pool) {
        await pool.end();
      }
    }
  }
}

// Run the script if called directly
if (require.main === module) {
  const mapper = new MLSkuMapper();
  mapper.run()
    .then(result => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Script failed:', error.message);
      process.exit(1);
    });
}

module.exports = MLSkuMapper;