#!/usr/bin/env node

/**
 * Job to update product images from Amazon Catalog API
 * Can be run manually or scheduled via cron/task scheduler
 * 
 * Usage:
 *   node update-product-images-job.js              # Process 50 products (default)
 *   node update-product-images-job.js --limit 100  # Process 100 products
 *   node update-product-images-job.js --all        # Process all products needing update
 */

require('dotenv').config();
const AmazonCatalogService = require('./src/services/amazon-catalog.service');

async function main() {
  const args = process.argv.slice(2);
  let limit = 50; // Default batch size
  
  // Parse arguments
  if (args.includes('--all')) {
    limit = 10000; // Process all
  } else {
    const limitIndex = args.indexOf('--limit');
    if (limitIndex !== -1 && args[limitIndex + 1]) {
      limit = parseInt(args[limitIndex + 1], 10);
    }
  }

  console.log('╔════════════════════════════════════════════╗');
  console.log('║     Amazon Product Image Update Job        ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log(`📅 Started at: ${new Date().toISOString()}`);
  console.log(`📦 Batch limit: ${limit}`);
  console.log('');

  const catalogService = new AmazonCatalogService();
  
  try {
    const startTime = Date.now();
    const results = await catalogService.updateAllMissingImages(limit);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('');
    console.log('╔════════════════════════════════════════════╗');
    console.log('║              Job Completed                 ║');
    console.log('╚════════════════════════════════════════════╝');
    console.log(`⏱️  Duration: ${duration} seconds`);
    console.log(`📊 Total Processed: ${results.totalProcessed}`);
    
    if (results.totalProcessed === 0) {
      console.log('✨ All products have up-to-date images!');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('❌ Job failed with error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⚠️  Job interrupted by user');
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log('\n⚠️  Job terminated');
  process.exit(143);
});

// Run the job
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});