const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');
const crypto = require('crypto');
const router = express.Router();

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || '49.12.191.119',
  port: process.env.DB_PORT || 5456,
  database: process.env.DB_NAME || 'amazon_monitor',
  user: process.env.DB_USER || 'saas',
  password: process.env.DB_PASSWORD || 'saas_password_123'
});

// Cache for image URLs (in-memory, simple implementation)
const imageCache = new Map();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// Image size fallbacks
const IMAGE_SIZES = ['_SX240_', '_SX160_', '_SL1500_', '_SL1000_', '_AC_'];

/**
 * Decode Base64 ID to ASIN
 */
function decodeAsin(base64Id) {
  try {
    const decoded = Buffer.from(base64Id, 'base64').toString('utf-8');
    // Validate ASIN format
    if (!/^[A-Z0-9]{10}$/.test(decoded)) {
      return null;
    }
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Generate ETag from content
 */
function generateETag(content) {
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Try different image size variants
 */
async function tryImageVariants(imageKey) {
  for (const size of IMAGE_SIZES) {
    const url = `https://m.media-amazon.com/images/I/${imageKey}${size}.jpg`;
    try {
      const response = await axios.head(url, {
        timeout: 3000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (response.status === 200) {
        return url;
      }
    } catch (error) {
      // Continue to next variant
    }
  }
  return null;
}

/**
 * Main image proxy endpoint
 */
router.get('/:id.jpg', async (req, res) => {
  const { id } = req.params;
  const ifNoneMatch = req.headers['if-none-match'];
  
  try {
    // Decode Base64 to ASIN
    const asin = decodeAsin(id);
    if (!asin) {
      console.warn(`Invalid Base64 ID: ${id}`);
      return res.status(400).json({ error: 'Invalid product ID' });
    }
    
    // Check cache first
    const cacheKey = `${asin}:image`;
    const cached = imageCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      // Handle ETag
      if (ifNoneMatch && ifNoneMatch === cached.etag) {
        return res.status(304).end(); // Not Modified
      }
      
      // Set headers
      res.set({
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=604800, s-maxage=604800', // 7 days
        'ETag': cached.etag,
        'X-Cache': 'HIT',
        'Access-Control-Allow-Origin': '*'
      });
      
      // Stream cached image
      const imageResponse = await axios.get(cached.url, {
        responseType: 'stream',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      return imageResponse.data.pipe(res);
    }
    
    // Query database for product image info
    const dbResult = await pool.query(
      `SELECT image_source_url, image_key, image_etag, marketplace_id 
       FROM products 
       WHERE asin = $1`,
      [asin]
    );
    
    if (dbResult.rows.length === 0) {
      console.warn(`Product not found: ${asin}`);
      // Serve placeholder
      return serveGenericPlaceholder(res, asin);
    }
    
    const product = dbResult.rows[0];
    let imageUrl = null;
    
    // Try to resolve image URL
    if (product.image_source_url) {
      // Use exact source URL from database
      imageUrl = product.image_source_url;
    } else if (product.image_key) {
      // Try different size variants
      imageUrl = await tryImageVariants(product.image_key);
      
      // Update database with working URL
      if (imageUrl) {
        await pool.query(
          `UPDATE products 
           SET image_source_url = $1, image_last_checked_at = NOW() 
           WHERE asin = $2`,
          [imageUrl, asin]
        );
      }
    }
    
    if (!imageUrl) {
      console.warn(`No valid image found for ASIN: ${asin}`);
      return serveGenericPlaceholder(res, asin);
    }
    
    // Fetch image from Amazon
    try {
      const imageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      const imageBuffer = Buffer.from(imageResponse.data);
      const etag = generateETag(imageBuffer);
      
      // Update cache
      imageCache.set(cacheKey, {
        url: imageUrl,
        etag: etag,
        timestamp: Date.now()
      });
      
      // Update database ETag
      await pool.query(
        `UPDATE products 
         SET image_etag = $1, image_last_checked_at = NOW() 
         WHERE asin = $2`,
        [etag, asin]
      );
      
      // Handle ETag
      if (ifNoneMatch && ifNoneMatch === etag) {
        return res.status(304).end(); // Not Modified
      }
      
      // Set headers
      res.set({
        'Content-Type': imageResponse.headers['content-type'] || 'image/jpeg',
        'Content-Length': imageBuffer.length,
        'Cache-Control': 'public, max-age=604800, s-maxage=604800', // 7 days
        'ETag': etag,
        'X-Cache': 'MISS',
        'Access-Control-Allow-Origin': '*'
      });
      
      // Send image
      return res.send(imageBuffer);
      
    } catch (fetchError) {
      console.error(`Failed to fetch image from Amazon for ${asin}:`, fetchError.message);
      
      // Mark as failed in database
      await pool.query(
        `UPDATE products 
         SET image_last_checked_at = NOW() 
         WHERE asin = $1`,
        [asin]
      );
      
      return serveGenericPlaceholder(res, asin);
    }
    
  } catch (error) {
    console.error('Image proxy error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Serve a generic placeholder image
 */
async function serveGenericPlaceholder(res, asin) {
  // Use a placeholder service or local file
  const placeholderUrl = `https://via.placeholder.com/300x300.png?text=${asin}`;
  
  res.set({
    'Cache-Control': 'public, max-age=60', // Short cache for placeholder
    'X-Placeholder': 'true',
    'Access-Control-Allow-Origin': '*'
  });
  
  // Redirect to placeholder
  return res.redirect(placeholderUrl);
}

// Metrics endpoint
router.get('/metrics', async (req, res) => {
  const stats = {
    cacheSize: imageCache.size,
    cacheHits: 0, // Would need to track this
    cacheMisses: 0, // Would need to track this
  };
  res.json(stats);
});

module.exports = router;