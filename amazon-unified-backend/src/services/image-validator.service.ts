import { logger } from '../utils/logger';
import { pool } from '../config/database';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as https from 'https';

export class ImageValidatorService {
  private static instance: ImageValidatorService;
  private imagesDir: string;
  private isRunning: boolean = false;
  
  // Known placeholder image signatures (MD5 hashes)
  private readonly PLACEHOLDER_SIGNATURES = [
    'd3b07384d113edec49eaa6238ad5ff00', // Common "No Image Available" placeholder
    '5d41402abc4b2a76b9719d911017c592', // Another common placeholder
  ];
  
  // Minimum valid image size (5KB)
  private readonly MIN_VALID_SIZE = 5000;

  private constructor() {
    this.imagesDir = path.join(__dirname, '..', '..', 'public', 'product-images');
  }

  public static getInstance(): ImageValidatorService {
    if (!ImageValidatorService.instance) {
      ImageValidatorService.instance = new ImageValidatorService();
    }
    return ImageValidatorService.instance;
  }

  /**
   * Calculate MD5 hash of a file
   */
  private getFileHash(filepath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5');
      const stream = fs.createReadStream(filepath);
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Check if an image is likely a placeholder
   */
  private async isPlaceholderImage(filepath: string): Promise<boolean> {
    try {
      // Check if file exists
      if (!fs.existsSync(filepath)) {
        return true;
      }

      // Check file size - placeholders are usually small
      const stats = fs.statSync(filepath);
      if (stats.size < this.MIN_VALID_SIZE) {
        logger.debug(`Small file detected: ${filepath} (${stats.size} bytes)`);
        return true;
      }

      // Check against known placeholder hashes
      const hash = await this.getFileHash(filepath);
      if (this.PLACEHOLDER_SIGNATURES.includes(hash)) {
        logger.debug(`Known placeholder signature detected: ${filepath}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Error checking file ${filepath}:`, error);
      return true; // Assume it's bad if we can't check it
    }
  }

  /**
   * Download image from URL
   */
  private downloadImage(url: string, filepath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Ensure HTTPS
      if (url.startsWith('http://')) {
        url = url.replace('http://', 'https://');
      }

      const file = fs.createWriteStream(filepath);
      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(filepath, () => {}); // Delete the file on error
        reject(err);
      });
    });
  }

  /**
   * Fix a single product's image
   */
  private async fixProductImage(asin: string): Promise<boolean> {
    try {
      // Try to get a real image from order_items
      const result = await pool.query(`
        SELECT DISTINCT product_image_url 
        FROM order_items 
        WHERE asin = $1 
          AND product_image_url IS NOT NULL 
          AND product_image_url != ''
          AND product_image_url NOT LIKE '%01RmK+J4pJL%'
          AND product_image_url NOT LIKE '%no_image%'
          AND product_image_url NOT LIKE '%placeholder%'
        LIMIT 1
      `, [asin]);

      if (result.rows.length === 0 || !result.rows[0].product_image_url) {
        logger.warn(`No alternative image found for ${asin}`);
        return false;
      }

      const imageUrl = result.rows[0].product_image_url;
      const filename = `${asin}.jpg`;
      const filepath = path.join(this.imagesDir, filename);

      // Delete existing placeholder if it exists
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }

      // Download new image
      await this.downloadImage(imageUrl, filepath);

      // Verify it's not another placeholder
      const stillPlaceholder = await this.isPlaceholderImage(filepath);
      if (stillPlaceholder) {
        logger.warn(`Downloaded image for ${asin} is also a placeholder`);
        fs.unlinkSync(filepath); // Remove the bad image
        return false;
      }

      // Update database with audit and consistency lock
      const { rows } = await pool.query(`SELECT image_url, local_image_url FROM products WHERE asin = $1`, [asin]);
      const current = rows[0] || { image_url: null, local_image_url: null };

      const { assertImageUpdateAllowed } = await import('../utils/consistency');
      const { imageAudit } = await import('./image-audit.service');

      if (!assertImageUpdateAllowed('image-validator.fixProductImage', asin)) {
        await imageAudit.record({
          asin,
          old_image_url: current.image_url,
          new_image_url: imageUrl,
          old_local_image_url: current.local_image_url,
          new_local_image_url: `/product-images/${filename}`,
          was_blocked: true,
          reason: 'CONSISTENCY_LOCK',
          actor: 'system',
          source: 'image-validator.fixProductImage'
        });
        logger.warn(`Image DB update blocked by CONSISTENCY_LOCK for ${asin}`);
        return false;
      }

      await pool.query(`
        UPDATE products 
        SET 
          image_url = $2,
          local_image_url = $3,
          updated_at = NOW()
        WHERE asin = $1
      `, [asin, imageUrl, `/product-images/${filename}`]);

      await imageAudit.record({
        asin,
        old_image_url: current.image_url,
        new_image_url: imageUrl,
        old_local_image_url: current.local_image_url,
        new_local_image_url: `/product-images/${filename}`,
        was_blocked: false,
        reason: 'FIX_PLACEHOLDER',
        actor: 'system',
        source: 'image-validator.fixProductImage'
      });

      logger.info(`Successfully fixed image for ${asin}`);
      return true;
    } catch (error) {
      logger.error(`Failed to fix image for ${asin}:`, error);
      return false;
    }
  }

  /**
   * Validate and fix all product images
   */
  public async validateAndFixAll(): Promise<{
    success: boolean;
    checked: number;
    valid: number;
    fixed: number;
    stillProblematic: number;
  }> {
    if (this.isRunning) {
      logger.warn('Image validation is already running');
      return {
        success: false,
        checked: 0,
        valid: 0,
        fixed: 0,
        stillProblematic: 0
      };
    }

    this.isRunning = true;
    logger.info('Starting automatic image validation and fix...');

    try {
      // Get all products
      const result = await pool.query(`
        SELECT asin, title, image_url, local_image_url
        FROM products
        WHERE asin IS NOT NULL
        ORDER BY asin
      `);

      const products = result.rows;
      let checked = 0;
      let valid = 0;
      let fixed = 0;
      let problematic = 0;

      for (const product of products) {
        checked++;
        const filename = `${product.asin}.jpg`;
        const filepath = path.join(this.imagesDir, filename);

        const isPlaceholder = await this.isPlaceholderImage(filepath);

        if (isPlaceholder) {
          logger.debug(`Placeholder detected for ${product.asin}`);
          problematic++;
          
          // Try to fix it
          const wasFixed = await this.fixProductImage(product.asin);
          if (wasFixed) {
            fixed++;
            problematic--;
          }
        } else {
          valid++;
        }

        // Log progress every 10 products
        if (checked % 10 === 0) {
          logger.debug(`Progress: ${checked}/${products.length} products checked`);
        }
      }

      const stillProblematic = problematic;

      logger.info(`Image validation complete: ${checked} checked, ${valid} valid, ${fixed} fixed, ${stillProblematic} still problematic`);

      this.isRunning = false;
      return {
        success: true,
        checked,
        valid,
        fixed,
        stillProblematic
      };
    } catch (error) {
      logger.error('Image validation failed:', error);
      this.isRunning = false;
      return {
        success: false,
        checked: 0,
        valid: 0,
        fixed: 0,
        stillProblematic: 0
      };
    }
  }

  /**
   * Validate a single product's image
   */
  public async validateSingleProduct(asin: string): Promise<boolean> {
    try {
      const filename = `${asin}.jpg`;
      const filepath = path.join(this.imagesDir, filename);

      const isPlaceholder = await this.isPlaceholderImage(filepath);

      if (isPlaceholder) {
        logger.info(`Fixing placeholder image for ${asin}`);
        return await this.fixProductImage(asin);
      }

      return true; // Image is valid
    } catch (error) {
      logger.error(`Failed to validate image for ${asin}:`, error);
      return false;
    }
  }
}

export const imageValidator = ImageValidatorService.getInstance();