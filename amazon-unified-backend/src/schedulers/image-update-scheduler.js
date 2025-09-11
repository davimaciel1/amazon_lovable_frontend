/**
 * Scheduler for periodic product image updates
 * Can be run as a standalone process or integrated with existing schedulers
 */

const CronJob = require('cron').CronJob;
const AmazonCatalogService = require('../services/amazon-catalog.service');

class ImageUpdateScheduler {
  constructor() {
    this.catalogService = new AmazonCatalogService();
    this.job = null;
    this.isRunning = false;
  }

  /**
   * Start the scheduler
   * @param {string} cronPattern - Cron pattern (default: daily at 3 AM)
   * @param {number} batchSize - Number of products to process per run
   */
  start(cronPattern = '0 3 * * *', batchSize = 100) {
    if (this.job) {
      console.log('⚠️ Scheduler is already running');
      return;
    }

    console.log('🚀 Starting Image Update Scheduler');
    console.log(`📅 Schedule: ${cronPattern}`);
    console.log(`📦 Batch size: ${batchSize} products per run`);

    this.job = new CronJob(
      cronPattern,
      async () => {
        if (this.isRunning) {
          console.log('⏭️ Previous job still running, skipping this execution');
          return;
        }

        await this.runUpdate(batchSize);
      },
      null,
      true,
      'America/Sao_Paulo' // Adjust timezone as needed
    );

    console.log('✅ Scheduler started successfully');
    
    // Also run immediately on start if needed
    if (process.env.RUN_ON_START === 'true') {
      console.log('🏃 Running initial update...');
      this.runUpdate(batchSize);
    }
  }

  /**
   * Run a single update cycle
   */
  async runUpdate(batchSize) {
    if (this.isRunning) {
      console.log('⚠️ Update already in progress');
      return;
    }

    this.isRunning = true;
    const startTime = new Date();
    
    console.log('\n' + '='.repeat(50));
    console.log(`🔄 Image Update Job Started`);
    console.log(`📅 Time: ${startTime.toISOString()}`);
    console.log('='.repeat(50));

    try {
      const results = await this.catalogService.updateAllMissingImages(batchSize);
      
      const duration = ((Date.now() - startTime.getTime()) / 1000).toFixed(2);
      
      console.log('\n✅ Job completed successfully');
      console.log(`⏱️ Duration: ${duration} seconds`);
      console.log(`📊 Processed: ${results.totalProcessed} products`);
      
      // Log to database or monitoring system if needed
      this.logJobResult({
        status: 'success',
        duration,
        processed: results.totalProcessed,
        ...results
      });
      
    } catch (error) {
      console.error('❌ Job failed:', error.message);
      
      this.logJobResult({
        status: 'error',
        error: error.message,
        stackTrace: error.stack
      });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (!this.job) {
      console.log('⚠️ Scheduler is not running');
      return;
    }

    this.job.stop();
    this.job = null;
    console.log('🛑 Scheduler stopped');
  }

  /**
   * Check if scheduler is running
   */
  isActive() {
    return this.job !== null && this.job.running;
  }

  /**
   * Get next scheduled run time
   */
  getNextRun() {
    if (!this.job) {
      return null;
    }
    
    const nextDates = this.job.nextDates(1);
    return nextDates.length > 0 ? nextDates[0].toISO() : null;
  }

  /**
   * Log job results (can be extended to save to database)
   */
  logJobResult(result) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'image_update_job',
      ...result
    };

    // In production, save to database or send to monitoring service
    // For now, just log to console
    if (result.status === 'success') {
      console.log('📊 Job metrics:', JSON.stringify(logEntry, null, 2));
    } else {
      console.error('❌ Job error:', JSON.stringify(logEntry, null, 2));
    }
  }
}

// Export singleton instance
const scheduler = new ImageUpdateScheduler();

module.exports = scheduler;

// If run directly, start the scheduler
if (require.main === module) {
  require('dotenv').config();
  
  const cronPattern = process.env.IMAGE_UPDATE_CRON || '0 3 * * *'; // Daily at 3 AM
  const batchSize = parseInt(process.env.IMAGE_UPDATE_BATCH_SIZE || '100', 10);
  
  scheduler.start(cronPattern, batchSize);
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n⚠️ Received SIGINT, stopping scheduler...');
    scheduler.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('\n⚠️ Received SIGTERM, stopping scheduler...');
    scheduler.stop();
    process.exit(0);
  });
  
  // Keep process alive
  console.log('💫 Scheduler is running. Press Ctrl+C to stop.');
}