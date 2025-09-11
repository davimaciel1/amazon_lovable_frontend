/**
 * Image Manager Service
 * Downloads and manages Amazon product images locally
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

class ImageManagerService {
  private imagesDir: string;
  private publicDir: string;

  constructor() {
    // Create directories for storing images
    this.publicDir = path.join(__dirname, '../../public');
    this.imagesDir = path.join(this.publicDir, 'product-images');
    
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    // Create public directory if it doesn't exist
    if (!fs.existsSync(this.publicDir)) {
      fs.mkdirSync(this.publicDir, { recursive: true });
      logger.info('Created public directory');
    }

    // Create product-images directory if it doesn't exist
    if (!fs.existsSync(this.imagesDir)) {
      fs.mkdirSync(this.imagesDir, { recursive: true });
      logger.info('Created product-images directory');
    }
  }

  /**
   * Download image from URL and save locally
   */
  private downloadImage(url: string, filepath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(filepath);
      
      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download image: ${response.statusCode}`));
          return;
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve();
        });

        file.on('error', (err) => {
          fs.unlink(filepath, () => {}); // Delete partial file
          reject(err);
        });
      }).on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Get local image filename from Amazon URL
   */
  private getImageFilename(amazonUrl: string, asin: string): string {
    // Extract image ID from Amazon URL
    const match = amazonUrl.match(/\/([A-Z0-9]+)\._/i);
    const imageId = match ? match[1] : asin;
    return `${imageId}.jpg`;
  }

  /**
   * Process single product image
   */
  async processProductImage(asin: string, amazonUrl: string): Promise<string | null> {
    try {
      if (!amazonUrl || !amazonUrl.includes('amazon.com')) {
        return null;
      }

      const filename = this.getImageFilename(amazonUrl, asin);
      const filepath = path.join(this.imagesDir, filename);
      const localUrl = `/product-images/${filename}`;

      // Check if image already exists
      if (fs.existsSync(filepath)) {
        logger.info(`Image already exists for ASIN ${asin}: ${filename}`);
        return localUrl;
      }

      // Download image
      logger.info(`Downloading image for ASIN ${asin} from ${amazonUrl}`);
      await this.downloadImage(amazonUrl, filepath);
      logger.info(`Successfully downloaded image for ASIN ${asin}: ${filename}`);

      // Update database with local URL (guard with CONSISTENCY_LOCK and audit)
      const { rows } = await pool.query('SELECT image_url, local_image_url FROM products WHERE asin = $1', [asin]);
      const current = rows[0] || { image_url: null, local_image_url: null };
      const { assertImageUpdateAllowed } = await import('../utils/consistency');
      const { imageAudit } = await import('./image-audit.service');

      if (!assertImageUpdateAllowed('image-manager.processProductImage', asin)) {
        await imageAudit.record({
          asin,
          old_image_url: current.image_url,
          new_image_url: current.image_url, // not changing when blocked
          old_local_image_url: current.local_image_url,
          new_local_image_url: localUrl, // intended
          was_blocked: true,
          reason: 'CONSISTENCY_LOCK',
          actor: 'system',
          source: 'image-manager.processProductImage'
        });
        return localUrl;
      }

      await pool.query(
        'UPDATE products SET local_image_url = $1, updated_at = NOW() WHERE asin = $2',
        [localUrl, asin]
      );

      await imageAudit.record({
        asin,
        old_image_url: current.image_url,
        new_image_url: current.image_url,
        old_local_image_url: current.local_image_url,
        new_local_image_url: localUrl,
        was_blocked: false,
        reason: 'DOWNLOAD',
        actor: 'system',
        source: 'image-manager.processProductImage'
      });

      return localUrl;
    } catch (error) {
      logger.error(`Error processing image for ASIN ${asin}:`, error);
      return null;
    }
  }

  /**
   * Process all product images in database
   */
  async processAllProductImages(): Promise<void> {
    try {
      // Add local_image_url column if it doesn't exist
      await pool.query(`
        ALTER TABLE products 
        ADD COLUMN IF NOT EXISTS local_image_url VARCHAR(500)
      `);

      // Get all products with Amazon image URLs
      const result = await pool.query(`
        SELECT asin, image_url 
        FROM products 
        WHERE image_url IS NOT NULL 
        AND image_url LIKE '%amazon.com%'
        AND (local_image_url IS NULL OR local_image_url = '')
      `);

      logger.info(`Found ${result.rows.length} products to process`);

      let successCount = 0;
      let errorCount = 0;

      // Process each product
      for (const product of result.rows) {
        const localUrl = await this.processProductImage(product.asin, product.image_url);
        if (localUrl) {
          successCount++;
        } else {
          errorCount++;
        }
        
        // Add delay to avoid overwhelming Amazon
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      logger.info(`Image processing complete: ${successCount} success, ${errorCount} errors`);
    } catch (error) {
      logger.error('Error processing all product images:', error);
      throw error;
    }
  }

  /**
   * Get image URL for a product (local if available, otherwise Amazon URL)
   */
  async getProductImageUrl(asin: string): Promise<string | null> {
    try {
      const result = await pool.query(
        'SELECT local_image_url, image_url FROM products WHERE asin = $1',
        [asin]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const product = result.rows[0];
      return product.local_image_url || product.image_url || null;
    } catch (error) {
      logger.error(`Error getting image URL for ASIN ${asin}:`, error);
      return null;
    }
  }
}

export const imageManager = new ImageManagerService();