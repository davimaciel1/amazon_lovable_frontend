import { Router, Request, Response } from 'express';
import axios from 'axios';
import { pool as db } from '../config/database';
import sharp from 'sharp';
import crypto from 'crypto';
import NodeCache from 'node-cache';
import fs from 'fs';
import path from 'path';

const router = Router();
const imageCache = new NodeCache({ stdTTL: 604800 }); // 7 days cache

// Use shared database pool

// CÓDIGOS MLB REAIS - validados e existem no Mercado Livre
const ML_SKU_MAPPING: Record<string, {mlb: string, image: string}> = {
  'IPAS01': {
    mlb: 'MLB-3628967960',
    image: 'https://http2.mlstatic.com/D_NQ_NP_2X_996651-MLB71319095517_082023-F.webp'
  },
  'IPAS02': {
    mlb: 'MLB25563772',
    image: 'https://http2.mlstatic.com/D_NQ_NP_2X_858526-MLB46917688635_072021-F.webp'
  },
  'IPAS04': {
    mlb: 'MLB-2882967139',
    image: 'https://http2.mlstatic.com/D_NQ_NP_2X_609133-MLB69321002471_052023-F.webp'
  }
};

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

// Get real ML image URL for custom SKUs
function getMercadoLivreImageUrl(sku: string): string | null {
  const mapping = ML_SKU_MAPPING[sku];
  return mapping ? mapping.image : null;
}

// Generate ETag from buffer
function generateETag(buffer: Buffer): string {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

// Known fallback images mapping removed; we now render local placeholders instead.

// Render a real image (PNG/JPEG/WEBP) placeholder so <img> always shows a bitmap
async function renderPlaceholder(format: string, asin: string): Promise<Buffer> {
  const svg = `
    <svg width="300" height="300" xmlns="http://www.w3.org/2000/svg">
      <rect width="300" height="300" fill="#f3f4f6"/>
      <text x="150" y="150" font-family="Arial" font-size="14" fill="#9ca3af" text-anchor="middle">
        No Image (${asin})
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
    const placeholder = await renderPlaceholder(format, 'invalid');
    res.set({ 'Content-Type': `image/${format === 'jpg' ? 'jpeg' : format}`, 'Cache-Control': 'public, max-age=60' });
    return res.send(placeholder);
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
        'Cache-Control': 'public, max-age=604800, s-maxage=604800',
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
      console.log('Product not found:', asin);
      const placeholder = await renderPlaceholder(format, String(asin).toUpperCase());
      res.set({ 'Content-Type': `image/${format === 'jpg' ? 'jpeg' : format}`, 'Cache-Control': 'public, max-age=300' });
      return res.send(placeholder);
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
            'Cache-Control': 'public, max-age=604800, s-maxage=604800',
            'ETag': etag,
            'X-Product-ASIN': asin
          });
          return res.send(sendBuf);
        }
      } catch {}
    }

    let imageUrl = (product.image_source_url as string | null) || (product.image_url as string | null);
    console.log(`🔍 [IMAGE DEBUG] Final imageUrl for "${asin}": "${imageUrl}"`);

    // Check if this is a custom SKU that maps to a Mercado Livre image
    const mlImageUrl = getMercadoLivreImageUrl(asin);
    if (mlImageUrl) {
      console.log(`🔗 [ML IMAGE] Using mapped ML image for SKU "${asin}": ${mlImageUrl}`);
      imageUrl = mlImageUrl;
    }

    // If no image URL in DB and no ML mapping, render placeholder
    if (!imageUrl || imageUrl === '') {
      console.log(`❌ [IMAGE DEBUG] No valid imageUrl found, rendering placeholder for "${asin}"`);
      // No known image URL; render a local placeholder image (PNG/JPEG)
      const placeholder = await renderPlaceholder(format, asinUpper);
      res.set({ 'Content-Type': `image/${format === 'jpg' ? 'jpeg' : format}`, 'Cache-Control': 'public, max-age=300' });
      return res.send(placeholder);
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
      console.log(`❌ [IMAGE DEBUG] HTTP error ${imageResponse.status} for "${asin}", falling back to placeholder`);
      const placeholder = await renderPlaceholder(format, String(asin).toUpperCase());
      res.set({ 'Content-Type': `image/${format === 'jpg' ? 'jpeg' : format}`, 'Cache-Control': 'public, max-age=300' });
      return res.send(placeholder);
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
      // Fall back to placeholder on conversion error
      const placeholder = await renderPlaceholder(format, String(asin).toUpperCase());
      res.set({ 'Content-Type': `image/${format === 'jpg' ? 'jpeg' : format}`, 'Cache-Control': 'public, max-age=300' });
      return res.send(placeholder);
    }

    // Cache the processed image
    imageCache.set(cacheKey, imageBuffer);

    // Generate ETag
    const etag = generateETag(imageBuffer);

    // Send response with appropriate headers
    res.set({
      'Content-Type': `image/${format === 'jpg' ? 'jpeg' : format}`,
      'Cache-Control': 'public, max-age=604800, s-maxage=604800',
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

    // Return a rendered PNG/JPEG placeholder (no inline SVG)
    const asinUpper = typeof asin === 'string' ? asin.toUpperCase() : String(asin || '').toUpperCase();
    const placeholder = await renderPlaceholder(format, asinUpper);
    res.set({ 'Content-Type': `image/${format === 'jpg' ? 'jpeg' : format}`, 'Cache-Control': 'public, max-age=300' });
    return res.send(placeholder);
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
