#!/usr/bin/env node

/**
 * Simplified ML SKU Query Script - Environment Variables Only
 * 
 * This version uses environment variables directly instead of database credentials
 * to avoid authentication issues while testing.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

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

class SimpleMLSkuMapper {
  constructor() {
    this.accessToken = null;
    this.accessTokenExpiry = null;
  }

  /**
   * Get ML credentials from environment variables
   */
  getCredentials() {
    const clientId = process.env.ML_CLIENT_ID;
    const clientSecret = process.env.ML_CLIENT_SECRET;
    const refreshToken = process.env.ML_REFRESH_TOKEN;
    const sellerId = process.env.ML_SELLER_ID || process.env.ML_USER_ID;

    if (!clientId || !clientSecret || !refreshToken || !sellerId) {
      console.log('\n❌ Missing ML credentials in environment variables:');
      console.log(`ML_CLIENT_ID: ${clientId ? '✅ Set' : '❌ Missing'}`);
      console.log(`ML_CLIENT_SECRET: ${clientSecret ? '✅ Set' : '❌ Missing'}`);
      console.log(`ML_REFRESH_TOKEN: ${refreshToken ? '✅ Set' : '❌ Missing'}`);
      console.log(`ML_SELLER_ID: ${sellerId ? '✅ Set' : '❌ Missing'}`);
      console.log('\nPlease set these environment variables before running the script.');
      throw new Error('Missing required ML credentials in environment variables');
    }

    return { clientId, clientSecret, refreshToken, sellerId };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken() {
    console.log('🔄 Refreshing ML access token...');
    const { clientId, clientSecret, refreshToken } = this.getCredentials();

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
      console.error('❌ Token refresh failed:', resp.status, resp.statusText);
      console.error('Response:', resp.data);
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
   * Search for specific item by exact item ID
   */
  async searchByItemId(itemId, accessToken) {
    try {
      console.log(`🔍 Searching for item: ${itemId}`);
      
      const url = `https://api.mercadolibre.com/items/${itemId}`;
      const resp = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 15000,
        validateStatus: () => true,
      });

      if (resp.status === 404) {
        return null; // Item not found
      }

      if (resp.status !== 200) {
        console.log(`⚠️ Item ${itemId} HTTP ${resp.status}: ${resp.statusText}`);
        return null;
      }

      const item = resp.data;
      return {
        item_id: item.id,
        title: item.title,
        status: item.status,
        permalink: item.permalink,
        thumbnail: item.thumbnail,
        seller_custom_field: item.seller_custom_field,
        price: item.price,
        currency_id: item.currency_id,
        available_quantity: item.available_quantity,
        variations: item.variations || []
      };
    } catch (error) {
      console.error(`❌ Error searching item ${itemId}:`, error.message);
      return null;
    }
  }

  /**
   * Search for seller items and filter by SKU
   */
  async searchSellerItemsBySku(sellerId, targetSkus, accessToken) {
    console.log(`🔍 Searching seller items for SKUs: ${targetSkus.join(', ')}`);
    
    const matches = {};
    let offset = 0;
    const limit = 100;

    try {
      for (let page = 0; page < 10; page++) { // Limit pages for safety
        const url = `https://api.mercadolibre.com/users/${sellerId}/items/search?status=active&search_type=scan&limit=${limit}&offset=${offset}`;
        
        const resp = await axios.get(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 30000,
          validateStatus: () => true,
        });

        if (resp.status !== 200) {
          console.log(`⚠️ Search items HTTP ${resp.status}: ${resp.statusText}`);
          break;
        }

        const itemIds = resp.data.results || [];
        if (itemIds.length === 0) break;
        
        console.log(`📄 Page ${page + 1}: Found ${itemIds.length} items`);

        // Get details for this batch of items
        for (let i = 0; i < itemIds.length; i += 20) {
          const batch = itemIds.slice(i, i + 20);
          await this.checkItemsBatch(batch, targetSkus, matches, accessToken);
          await new Promise(resolve => setTimeout(resolve, 300)); // Rate limiting
        }
        
        const paging = resp.data.paging || {};
        if (!paging.total || offset + limit >= paging.total) break;
        
        offset += limit;
      }
    } catch (error) {
      console.error('❌ Error searching seller items:', error.message);
    }

    return matches;
  }

  /**
   * Check a batch of items for SKU matches
   */
  async checkItemsBatch(itemIds, targetSkus, matches, accessToken) {
    try {
      const idsParam = itemIds.join(',');
      const url = `https://api.mercadolibre.com/items?ids=${idsParam}`;
      
      const resp = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 30000,
        validateStatus: () => true,
      });

      if (resp.status !== 200) return;

      const responses = resp.data || [];
      
      for (const itemResp of responses) {
        if (itemResp.code === 200 && itemResp.body) {
          const item = itemResp.body;
          this.checkItemForSkuMatches(item, targetSkus, matches);
        }
      }
    } catch (error) {
      console.error(`❌ Error checking items batch:`, error.message);
    }
  }

  /**
   * Check if an item matches any target SKUs
   */
  checkItemForSkuMatches(item, targetSkus, matches) {
    const itemId = item.id;
    const title = item.title || '';
    const sellerCustomField = item.seller_custom_field || '';
    const variations = item.variations || [];

    // Check main item for SKU match
    for (const sku of targetSkus) {
      const skuUpper = sku.toUpperCase();
      
      // Check seller_custom_field
      if (sellerCustomField.toUpperCase() === skuUpper) {
        if (!matches[sku]) matches[sku] = [];
        matches[sku].push({
          item_id: itemId,
          title: title,
          match_type: 'seller_custom_field',
          match_value: sellerCustomField,
          permalink: item.permalink || '',
          thumbnail: item.thumbnail || '',
          status: item.status || '',
          price: item.price || 0,
          available_quantity: item.available_quantity || 0,
          variations_count: variations.length
        });
        console.log(`  ✅ Found match for ${sku}: ${itemId} (${title})`);
      }

      // Check title contains SKU
      if (title.toUpperCase().includes(skuUpper)) {
        if (!matches[sku]) matches[sku] = [];
        matches[sku].push({
          item_id: itemId,
          title: title,
          match_type: 'title_contains',
          match_value: title,
          permalink: item.permalink || '',
          thumbnail: item.thumbnail || '',
          status: item.status || '',
          price: item.price || 0,
          available_quantity: item.available_quantity || 0,
          variations_count: variations.length
        });
        console.log(`  📋 Title match for ${sku}: ${itemId} (${title})`);
      }
    }

    // Check variations
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
            thumbnail: variation.picture_ids?.[0] || item.thumbnail || '',
            status: item.status || '',
            price: variation.price || item.price || 0,
            available_quantity: variation.available_quantity || 0,
            variations_count: variations.length
          });
          console.log(`  🔸 Variation match for ${sku}: ${itemId}/${variation.id} (${title})`);
        }
      }
    }
  }

  /**
   * Test specific item IDs mentioned by user
   */
  async testSpecificItemIds(accessToken) {
    console.log('\n🎯 Testing specific item IDs mentioned:');
    
    // Test current incorrect mapping
    const currentItem = await this.searchByItemId('MLB5677833500', accessToken);
    if (currentItem) {
      console.log('📋 Current IPAS01 mapping (MLB5677833500):');
      console.log(`   Title: "${currentItem.title}"`);
      console.log(`   SKU: "${currentItem.seller_custom_field}"`);
      console.log(`   Status: ${currentItem.status}`);
    }

    // Test expected correct mapping
    const expectedItem = await this.searchByItemId('MLBU3406999311', accessToken);
    if (expectedItem) {
      console.log('📋 Expected IPAS01 mapping (MLBU3406999311):');
      console.log(`   Title: "${expectedItem.title}"`);
      console.log(`   SKU: "${expectedItem.seller_custom_field}"`);
      console.log(`   Status: ${expectedItem.status}`);
    } else {
      console.log('⚠️ Expected item MLBU3406999311 not found or not accessible');
    }

    await new Promise(resolve => setTimeout(resolve, 500));
    return { currentItem, expectedItem };
  }

  /**
   * Generate simplified report
   */
  generateReport(matches, specificItems) {
    console.log('\n📊 RESULTS SUMMARY');
    console.log('=' .repeat(60));
    
    const correctedMappings = {};
    
    for (const [sku, items] of Object.entries(matches)) {
      console.log(`\n🏷️  SKU: ${sku}`);
      console.log(`   Current mapping: ${CURRENT_MAPPINGS[sku]?.mlb || 'none'}`);
      
      if (items.length === 0) {
        console.log('   ❌ No matches found!');
        continue;
      }

      // Sort by match type preference and status
      const sortedItems = items.sort((a, b) => {
        // Prefer active items
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (b.status === 'active' && a.status !== 'active') return 1;
        // Prefer exact seller_custom_field matches
        if (a.match_type === 'seller_custom_field' && b.match_type !== 'seller_custom_field') return -1;
        if (b.match_type === 'seller_custom_field' && a.match_type !== 'seller_custom_field') return 1;
        return 0;
      });

      const bestMatch = sortedItems[0];
      console.log(`   ✅ Best match: ${bestMatch.item_id}`);
      console.log(`      Title: "${bestMatch.title}"`);
      console.log(`      Match: ${bestMatch.match_type}`);
      console.log(`      Status: ${bestMatch.status}`);
      console.log(`      Price: ${bestMatch.price}`);
      
      correctedMappings[sku] = {
        mlb: bestMatch.item_id,
        title: bestMatch.title,
        match_type: bestMatch.match_type,
        permalink: bestMatch.permalink,
        thumbnail: bestMatch.thumbnail,
        status: bestMatch.status,
        price: bestMatch.price
      };
      
      // Check if this is different from current mapping
      if (CURRENT_MAPPINGS[sku]?.mlb !== bestMatch.item_id) {
        console.log(`   🔄 CHANGE NEEDED: ${CURRENT_MAPPINGS[sku]?.mlb || 'none'} → ${bestMatch.item_id}`);
      } else {
        console.log('   ✅ Current mapping is correct');
      }

      if (sortedItems.length > 1) {
        console.log(`   📋 Alternatives (${sortedItems.length - 1}):`);
        for (let i = 1; i < Math.min(3, sortedItems.length); i++) {
          const alt = sortedItems[i];
          console.log(`      ${alt.item_id}: "${alt.title}"`);
        }
      }
    }

    return correctedMappings;
  }

  /**
   * Save results to files
   */
  async saveResults(correctedMappings) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Save corrected mappings
    const mappingsFile = path.join(__dirname, `ml-sku-mappings-${timestamp}.json`);
    await fs.promises.writeFile(mappingsFile, JSON.stringify(correctedMappings, null, 2));
    console.log(`\n💾 Mappings saved to: ${mappingsFile}`);
    
    // Save as TypeScript constant
    const tsContent = `// Generated ML SKU mappings - ${new Date().toISOString()}
export const ML_SKU_MAPPING = ${JSON.stringify(correctedMappings, null, 2)};
`;
    const tsFile = path.join(__dirname, `ml-sku-mappings-${timestamp}.ts`);
    await fs.promises.writeFile(tsFile, tsContent);
    console.log(`🔧 TypeScript mapping saved to: ${tsFile}`);

    return { mappingsFile, tsFile };
  }

  /**
   * Main execution function
   */
  async run() {
    try {
      console.log('🚀 Starting Simplified ML SKU Mapping Query');
      console.log('Target SKUs:', TARGET_SKUS.join(', '));
      console.log('Expected: IPAS01 should map to MLBU3406999311\n');

      // Get credentials and authenticate
      const { sellerId } = this.getCredentials();
      console.log(`🏪 Seller ID: ${sellerId}`);
      
      const accessToken = await this.refreshAccessToken();
      console.log(`🔐 Access token obtained\n`);

      // Test specific item IDs first
      const specificItems = await this.testSpecificItemIds(accessToken);

      // Search for all seller items matching target SKUs
      const matches = await this.searchSellerItemsBySku(sellerId, TARGET_SKUS, accessToken);
      
      // Generate reports and recommendations
      const correctedMappings = this.generateReport(matches, specificItems);
      
      // Save results to files
      const files = await this.saveResults(correctedMappings);
      
      console.log('\n🎉 ML SKU mapping query completed successfully!');
      console.log('\nNext steps:');
      console.log('1. Review the generated mappings');
      console.log('2. Verify the recommended changes are correct');
      console.log('3. Update the ML_SKU_MAPPING in images.routes.ts');
      
      return {
        success: true,
        correctedMappings,
        files
      };

    } catch (error) {
      console.error('\n❌ Error during ML SKU mapping query:', error.message);
      throw error;
    }
  }
}

// Run the script if called directly
if (require.main === module) {
  const mapper = new SimpleMLSkuMapper();
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

module.exports = SimpleMLSkuMapper;