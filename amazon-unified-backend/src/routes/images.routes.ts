import { Router, Request, Response } from 'express';
import axios from 'axios';
import { pool as db } from '../config/database';
import sharp from 'sharp';
import crypto from 'crypto';
import NodeCache from 'node-cache';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

const router = Router();
const imageCache = new NodeCache({ stdTTL: 3600 }); // 1 hour cache for faster updates

// Use shared database pool

// REMOVED ALL HARDCODED MAPPINGS - System now uses only real data from database and Mercado Livre API
// No more fake/mock/hardcoded data - all images come from authentic sources

// Auto-fetch ML product images using real API
async function fetchMLProductAndSaveImage(sku: string): Promise<string | null> {
  try {
    logger.info(`🔍 Auto-fetching ML product for SKU: ${sku}`);
    
    // Get ML access token
    const tokenResponse = await axios.get('http://localhost:8080/api/ml/credentials/access-token');
    const accessToken = tokenResponse.data.access_token;
    
    if (!accessToken) {
      logger.error('❌ No ML access token available');
      return null;
    }
    
    // Get seller ID first
    const sellerResponse = await axios.get(
      'https://api.mercadolibre.com/users/me',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        },
        timeout: 10000
      }
    );

    const sellerId = sellerResponse.data.id;
    
    // Search for product by SKU using ML seller items API (correct endpoint)
    const searchResponse = await axios.get(
      `https://api.mercadolibre.com/users/${sellerId}/items/search?seller_sku=${encodeURIComponent(sku)}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        },
        timeout: 10000
      }
    );
    
    if (searchResponse.data.results && searchResponse.data.results.length > 0) {
      const itemId = searchResponse.data.results[0];
      
      // Get detailed item info
      const itemResponse = await axios.get(
        `https://api.mercadolibre.com/items/${itemId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          },
          timeout: 10000
        }
      );
      
      const item = itemResponse.data;
      
      if (item.pictures && item.pictures.length > 0) {
        const imageUrl = item.pictures[0].secure_url || item.pictures[0].url;
        
        // Save product to database
        const insertQuery = `
          INSERT INTO products (
            asin, sku, title, marketplace_id,
            image_url, image_source_url,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, NOW(), NOW()
          )
          ON CONFLICT (asin) DO UPDATE SET
            image_url = EXCLUDED.image_url,
            image_source_url = EXCLUDED.image_source_url,
            title = EXCLUDED.title,
            updated_at = NOW()
        `;
        
        await db.query(insertQuery, [
          sku,
          sku,
          item.title,
          'MLB',
          imageUrl,
          imageUrl
        ]);
        
        logger.info(`✅ Successfully fetched and saved ML product: ${sku}`);
        return imageUrl;
      }
    }
    
    logger.warn(`⚠️ No ML product found for SKU: ${sku}`);
    return null;
    
  } catch (error: any) {
    logger.error(`❌ Failed to fetch ML product for ${sku}:`, error.message);
    return null;
  }
}

// Decode Base64 product ID or return plain ID (supports multiple marketplaces)
function decodeAsin(encodedId: string): string | null {
  // First, always try to decode from base64
  try {
    const decoded = Buffer.from(encodedId, 'base64').toString('utf-8');
    // Validate decoded product ID format - supports:
    // - Amazon ASINs: [A-Z0-9]{10} (e.g., B07XQXZXQX)
    // - Mercado Livre: MLB[0-9]+ (e.g., MLB4100879553)  
    // - Custom SKUs: [A-Z0-9-]+ (e.g., IPP-PV-02)
    if (/^[A-Z0-9-]{3,20}$/.test(decoded)) {
      return decoded;
    }
    // If decoded string is invalid, fall through to check if original is already valid
  } catch {
    // If base64 decode fails, fall through to check if original is already valid
  }
  
  // Fall back: check if it's already a valid product ID (not base64 encoded)
  if (/^[A-Z0-9-]{3,20}$/.test(encodedId)) {
    return encodedId;
  }
  
  return null;
}

// REMOVED getMercadoLivreImageUrl() - No longer needed since we removed all hardcoded mappings
// System now uses only authentic data from database and real ML API calls

// Generate ETag from buffer
function generateETag(buffer: Buffer): string {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

// NO MORE PLACEHOLDERS - System shows error instead
// Render error image when automatic fetch fails
async function renderErrorImage(format: string, asin: string): Promise<Buffer> {
  const svg = `
    <svg width="300" height="300" xmlns="http://www.w3.org/2000/svg">
      <rect width="300" height="300" fill="#fef2f2"/>
      <text x="150" y="130" font-family="Arial" font-size="12" fill="#dc2626" text-anchor="middle">
        IMAGE NOT FOUND
      </text>
      <text x="150" y="160" font-family="Arial" font-size="10" fill="#991b1b" text-anchor="middle">
        Product: ${asin}
      </text>
      <text x="150" y="180" font-family="Arial" font-size="10" fill="#991b1b" text-anchor="middle">
        Auto-fetch failed
      </text>
    </svg>
  `;
  let buf = await sharp(Buffer.from(svg)).png({ quality: 90 }).toBuffer();
  const f = format.toLowerCase();
  if (f === 'jpg' || f === 'jpeg') {
    buf = await sharp(buf).jpeg({ quality: 90 }).toBuffer();
  } else if (f === 'webp') {
    buf = await sharp(buf).webp({ quality: 85 }).toBuffer();
  }
  return buf;
}

// Image proxy endpoint
router.get('/product-images/:id.:format', async (req: Request, res: Response): Promise<Response | void> => {
  const { id, format } = req.params;
  
  // Validate format
  if (!['jpg', 'jpeg', 'webp', 'png'].includes(format.toLowerCase())) {
    return res.status(400).send('Invalid image format');
  }

  // Decode and validate ASIN
  const asin = decodeAsin(id);
if (!asin) {
    console.error('Invalid ASIN ID:', id);
    const errorImage = await renderErrorImage(format, 'INVALID_ID');
    res.set({ 'Content-Type': `image/${format === 'jpg' ? 'jpeg' : format}`, 'Cache-Control': 'public, max-age=60' });
    return res.send(errorImage);
  }

  try {
    // Check cache first
    const cacheKey = `${asin}_${format}`;
    const cached = imageCache.get<Buffer>(cacheKey);
    
    if (cached) {
      const etag = generateETag(cached);
      
      // Check If-None-Match header
      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }
      
      res.set({
        'Content-Type': `image/${format === 'jpg' ? 'jpeg' : format}`,
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        'ETag': etag
      });
      return res.send(cached);
    }

    // Query database for product image URL (search by both ASIN and SKU)
const query = `
      SELECT asin, sku, image_url, image_source_url, local_image_url, title 
      FROM products 
      WHERE asin = $1 OR sku = $1
      LIMIT 1
    `;
    
    const result = await db.query(query, [asin]);
    
    console.log(`🔍 [IMAGE DEBUG] Query for "${asin}": found ${result.rows.length} rows`);
    if (result.rows.length > 0) {
      const row = result.rows[0];
      console.log(`🔍 [IMAGE DEBUG] Product found:`, {
        asin: row.asin,
        sku: row.sku,
        image_url: row.image_url,
        image_source_url: row.image_source_url,
        local_image_url: row.local_image_url
      });
    }
    
if (result.rows.length === 0) {
      console.log('Product not found in database, attempting auto-fetch:', asin);
      
      // Try to auto-fetch from ML API and save to database
      const fetchedImageUrl = await fetchMLProductAndSaveImage(asin);
      
      if (fetchedImageUrl) {
        // Re-query database for the newly inserted product
        const newResult = await db.query(query, [asin]);
        if (newResult.rows.length > 0) {
          // Continue with normal image processing
          const product = newResult.rows[0];
          const imageUrl = (product.image_source_url as string | null) || (product.image_url as string | null);
          
          if (imageUrl) {
            try {
              const imageResponse = await axios.get(imageUrl, {
                responseType: 'arraybuffer',
                timeout: 10000,
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                  'Accept': 'image/*'
                },
                maxRedirects: 5
              });
              
              if (imageResponse.status < 400) {
                let imageBuffer = Buffer.from(imageResponse.data);
                
                // Convert format if needed
                if (format === 'webp') {
                  imageBuffer = await sharp(imageBuffer).webp({ quality: 85 }).toBuffer();
                } else if (format === 'jpg' || format === 'jpeg') {
                  imageBuffer = await sharp(imageBuffer).jpeg({ quality: 90 }).toBuffer();
                }
                
                // Cache and return
                const cacheKey = `${asin}_${format}`;
                imageCache.set(cacheKey, imageBuffer);
                
                const etag = generateETag(imageBuffer);
                res.set({
                  'Content-Type': `image/${format === 'jpg' ? 'jpeg' : format}`,
                  'Cache-Control': 'public, max-age=3600, s-maxage=3600',
                  'ETag': etag,
                  'X-Product-ASIN': asin,
                  'X-Auto-Fetched': 'true'
                });
                
                return res.send(imageBuffer);
              }
            } catch (fetchError: any) {
              console.error(`❌ Error fetching auto-fetched image for ${asin}:`, fetchError.message);
            }
          }
        }
      }
      
      // Auto-fetch failed, show error image
      console.log('Auto-fetch failed, showing error image for:', asin);
      const errorImage = await renderErrorImage(format, String(asin).toUpperCase());
      res.set({ 
        'Content-Type': `image/${format === 'jpg' ? 'jpeg' : format}`, 
        'Cache-Control': 'public, max-age=300',
        'X-Error': 'Auto-fetch failed'
      });
      return res.send(errorImage);
    }

    const product = result.rows[0];
    const asinUpper = String(product.asin || '').toUpperCase();

    // Prefer local cached image file if available
    if (product.local_image_url) {
      try {
        // Resolve public directory for both dev (ts-node) and prod (dist)
        const publicDirCandidates = [
          path.join(__dirname, '..', 'public'),
          path.join(__dirname, '..', '..', 'public')
        ];
        const publicDir = publicDirCandidates.find(p => fs.existsSync(p)) || publicDirCandidates[0];
        const rel = product.local_image_url.startsWith('/') ? product.local_image_url.slice(1) : product.local_image_url;
        const filePath = path.join(publicDir, rel);
        if (fs.existsSync(filePath)) {
          const fileBuf = fs.readFileSync(filePath);
          // Convert if needed
          const f = format.toLowerCase();
          let sendBuf: Buffer = fileBuf;
          if (f === 'webp') sendBuf = (await sharp(fileBuf).webp({ quality: 85 }).toBuffer()) as Buffer;
          else if (f === 'jpg' || f === 'jpeg') sendBuf = (await sharp(fileBuf).jpeg({ quality: 90 }).toBuffer()) as Buffer;
          const etag = generateETag(sendBuf);
          if (req.headers['if-none-match'] === etag) {
            return res.status(304).end();
          }
          res.set({
            'Content-Type': `image/${format === 'jpg' ? 'jpeg' : format}`,
            'Cache-Control': 'public, max-age=3600, s-maxage=3600',
            'ETag': etag,
            'X-Product-ASIN': asin
          });
          return res.send(sendBuf);
        }
      } catch {}
    }

    let imageUrl = (product.image_source_url as string | null) || (product.image_url as string | null);
    console.log(`🔍 [IMAGE DEBUG] Using REAL database imageUrl for "${asin}": "${imageUrl}"`);

    // REMOVED hardcoded ML mapping override - Now uses only authentic data from database

    // If no image URL in DB, show error
    if (!imageUrl || imageUrl === '') {
      console.log(`❌ [IMAGE DEBUG] No valid imageUrl found, showing error for "${asin}"`);
      const errorImage = await renderErrorImage(format, asinUpper);
      res.set({ 
        'Content-Type': `image/${format === 'jpg' ? 'jpeg' : format}`, 
        'Cache-Control': 'public, max-age=300',
        'X-Error': 'No image URL in database'
      });
      return res.send(errorImage);
    }

    // Fetch image from external source (Amazon, Mercado Livre, etc)
    const urlOrigin = new URL(imageUrl).origin;
    const dynamicReferer = urlOrigin.includes('amazon') ? 'https://www.amazon.com/' : urlOrigin;
    
    console.log(`🌐 [IMAGE DEBUG] Starting fetch for "${asin}":`, {
      imageUrl,
      urlOrigin,
      dynamicReferer
    });
    
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*',
        'Referer': dynamicReferer
      },
      maxRedirects: 5,
      validateStatus: () => true // Log all status codes
    });

    console.log(`🌐 [IMAGE DEBUG] Fetch response for "${asin}":`, {
      status: imageResponse.status,
      statusText: imageResponse.statusText,
      contentType: imageResponse.headers['content-type'],
      contentLength: imageResponse.headers['content-length'],
      dataSize: imageResponse.data?.length || 'unknown'
    });

    if (imageResponse.status >= 400) {
      console.log(`❌ [IMAGE DEBUG] HTTP error ${imageResponse.status} for "${asin}", showing error image`);
      const errorImage = await renderErrorImage(format, String(asin).toUpperCase());
      res.set({ 
        'Content-Type': `image/${format === 'jpg' ? 'jpeg' : format}`, 
        'Cache-Control': 'public, max-age=300',
        'X-Error': `HTTP ${imageResponse.status}`
      });
      return res.send(errorImage);
    }

    let imageBuffer = Buffer.from(imageResponse.data);
    console.log(`🔄 [IMAGE DEBUG] Converting image for "${asin}":`, {
      originalSize: imageBuffer.length,
      originalType: imageResponse.headers['content-type'],
      requestedFormat: format
    });

    // Convert image format if needed
    try {
      if (format === 'webp' && req.headers.accept?.includes('image/webp')) {
        imageBuffer = await sharp(imageBuffer)
          .webp({ quality: 85 })
          .toBuffer();
      } else if (format === 'jpg' || format === 'jpeg') {
        imageBuffer = await sharp(imageBuffer)
          .jpeg({ quality: 90 })
          .toBuffer();
      }
      console.log(`✅ [IMAGE DEBUG] Conversion successful for "${asin}":`, {
        finalSize: imageBuffer.length,
        finalFormat: format
      });
    } catch (conversionError: any) {
      console.error(`❌ [IMAGE DEBUG] Conversion failed for "${asin}":`, {
        error: conversionError.message,
        originalType: imageResponse.headers['content-type'],
        requestedFormat: format
      });
      // Show error on conversion failure
      const errorImage = await renderErrorImage(format, String(asin).toUpperCase());
      res.set({ 
        'Content-Type': `image/${format === 'jpg' ? 'jpeg' : format}`, 
        'Cache-Control': 'public, max-age=300',
        'X-Error': 'Image conversion failed'
      });
      return res.send(errorImage);
    }

    // Cache the processed image
    imageCache.set(cacheKey, imageBuffer);

    // Generate ETag
    const etag = generateETag(imageBuffer);

    // Send response with appropriate headers
    res.set({
      'Content-Type': `image/${format === 'jpg' ? 'jpeg' : format}`,
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'ETag': etag,
      'X-Product-ASIN': asin
    });

    res.send(imageBuffer);

  } catch (error: any) {
    console.error(`❌ [IMAGE DEBUG] ERROR fetching image for "${asin}":`, {
      error_message: error.message,
      error_code: error.code,
      error_status: error.response?.status,
      error_statusText: error.response?.statusText,
      full_error: error
    });

    // Return error image instead of placeholder
    const asinUpper = typeof asin === 'string' ? asin.toUpperCase() : String(asin || '').toUpperCase();
    const errorImage = await renderErrorImage(format, asinUpper);
    res.set({ 
      'Content-Type': `image/${format === 'jpg' ? 'jpeg' : format}`, 
      'Cache-Control': 'public, max-age=300',
      'X-Error': 'Unexpected error'
    });
    return res.send(errorImage);
  }
});

// Helper endpoint to encode ASIN
router.get('/encode-asin/:asin', (req: Request, res: Response): Response => {
  const { asin } = req.params;
  
  if (!/^[A-Z0-9]{10}$/.test(asin)) {
    return res.status(400).json({ error: 'Invalid ASIN format' });
  }
  
  const encoded = Buffer.from(asin).toString('base64');
  return res.json({ 
    asin, 
    encoded,
    imageUrl: `/app/product-images/${encoded}.jpg`
  });
});

// Image proxy endpoint to bypass CORS for external images (e.g., Amazon CDN)
router.get('/api/image-proxy', async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const imageUrl = String(req.query.url || '')
      .trim();

    if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
      return res.status(400).send('Image URL is required');
    }

    const resp = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Referer': 'https://www.amazon.com/'
      },
      maxRedirects: 5,
      timeout: 10000,
      validateStatus: () => true
    });

    if (resp.status >= 400) {
      return res.status(resp.status).send('Image not found');
    }

    const contentType = resp.headers['content-type'] || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');

    return res.send(Buffer.from(resp.data));
  } catch (err) {
    console.error('Error in /api/image-proxy:', (err as any)?.message || err);
    return res.status(500).send('Error fetching image');
  }
});

export { router as imagesRouter, imageCache };
