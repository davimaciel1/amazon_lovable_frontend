const express = require('express');
const { Pool } = require('pg');

const router = express.Router();

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'app',
  user: process.env.DB_USER || 'app',
  password: process.env.DB_PASSWORD || ''
});

// Simple sales endpoint with images
router.get('/', async (req, res) => {
  try {
    // Parse and normalize query params
    const {
      startDate,
      endDate,
      sortBy = 'revenue',
      sortDir = 'desc',
      page = '1',
      limit = '50',
      keyword,
      countries, // e.g. 'US,CA'
      orderTypes, // e.g. 'FBA,FBM'
      brands, // e.g. 'Nike,Adidas'
    } = req.query;

    const endParamRaw = endDate ? String(endDate) : undefined;
    const startParamRaw = startDate ? String(startDate) : undefined;

    const endTs = endParamRaw ? new Date(endParamRaw) : new Date();
    const startTs = startParamRaw ? new Date(startParamRaw) : new Date(endTs.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Detect if params include time component (ISO with 'T')
    const endHasTime = !!(endParamRaw && endParamRaw.includes('T'));
    const startHasTime = !!(startParamRaw && startParamRaw.includes('T'));

    const pageNum = Math.max(parseInt(String(page)) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(String(limit)) || 50, 1), 200);
    const offset = (pageNum - 1) * limitNum;

    // Whitelist sort fields to prevent SQL injection
    const sortMap = {
      units: 's.units',
      revenue: 's.revenue',
      orders: 's.orders',
      price: 's.price',
    };
    const sortField = sortMap[String(sortBy)] || 's.revenue';
    const sortDirection = String(sortDir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Optional filters
    const values = [startTs.toISOString(), endTs.toISOString()];
    let whereExtra = '';

    // Keyword (asin, sku, title)
    if (keyword && String(keyword).trim().length > 0) {
      values.push(`%${String(keyword).trim()}%`);
      const idx = values.length;
      whereExtra += ` AND (oi.seller_sku ILIKE $${idx} OR oi.asin ILIKE $${idx} OR p.title ILIKE $${idx} OR oi.title ILIKE $${idx})`;
    }

    // Countries -> marketplace_id mapping
    const marketplaceMap = { US: 'ATVPDKIKX0DER', CA: 'A2EUQ1WTGCTBG2', MX: 'A1AM78C64UM0Y8' };
    const countryList = typeof countries === 'string' && countries.trim().length > 0
      ? String(countries).split(',').map(s => s.trim()).filter(Boolean)
      : [];
    if (countryList.length > 0) {
      const marketplaceIds = countryList.map(c => marketplaceMap[c] || c).filter(Boolean);
      if (marketplaceIds.length > 0) {
        values.push(marketplaceIds);
        const idx = values.length;
        whereExtra += ` AND o.marketplace_id = ANY($${idx})`;
      }
    }

    // Brands filter (exact match, case-insensitive)
    const brandList = typeof brands === 'string' && brands.trim().length > 0
      ? String(brands).split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      : [];
    if (brandList.length > 0) {
      values.push(brandList);
      const idx = values.length;
      whereExtra += ` AND p.brand IS NOT NULL AND LOWER(p.brand) = ANY($${idx})`;
    }

    // Detect available columns to safely build order type filters
    let hasFulfillment = false, hasIsBusiness = false, hasOrderType = false, hasSalesChannel = false, hasPromotionIds = false;
    try {
      const colRes = await pool.query(
        `SELECT table_name, column_name FROM information_schema.columns 
         WHERE table_schema='public' AND table_name IN ('orders','order_items') 
           AND column_name = ANY($1)`,
        [[ 'fulfillment_channel','is_business_order','order_type','sales_channel','promotion_ids' ]]
      );
      for (const r of colRes.rows) {
        if (r.table_name === 'orders') {
          if (r.column_name === 'fulfillment_channel') hasFulfillment = true;
          if (r.column_name === 'is_business_order') hasIsBusiness = true;
          if (r.column_name === 'order_type') hasOrderType = true;
          if (r.column_name === 'sales_channel') hasSalesChannel = true;
        }
        if (r.table_name === 'order_items') {
          if (r.column_name === 'promotion_ids') hasPromotionIds = true;
        }
      }
    } catch (e) {
      // If detection fails, proceed without optional filters
    }

    // Order types: FBA, FBM, Business, Retail, Subscribe, Promotional
    const orderTypeList = typeof orderTypes === 'string' && orderTypes.trim().length > 0
      ? String(orderTypes).split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
      : [];
    if (orderTypeList.length > 0) {
      const subClauses = [];

      // FBA/FBM via fulfillment_channel
      if (hasFulfillment) {
        const fc = [];
        if (orderTypeList.includes('FBA')) fc.push('AFN');
        if (orderTypeList.includes('FBM')) fc.push('MFN');
        if (fc.length > 0) {
          values.push(fc);
          const idx = values.length;
          subClauses.push(`o.fulfillment_channel = ANY($${idx})`);
        }
      }

      // Helper to add OR group of LIKEs
      const addLikeGroup = (labels) => {
        const likes = [];
        for (const label of labels) {
          if (hasOrderType) { values.push(`%${label}%`); likes.push(`o.order_type ILIKE $${values.length}`); }
          if (hasSalesChannel) { values.push(`%${label}%`); likes.push(`o.sales_channel ILIKE $${values.length}`); }
        }
        if (likes.length > 0) subClauses.push(`(${likes.join(' OR ')})`);
      };

      // Business
      if (orderTypeList.includes('BUSINESS')) {
        const parts = [];
        if (hasIsBusiness) parts.push('o.is_business_order = true');
        // Also fallback to textual matches when structure differs
        const beforeLen = values.length;
        addLikeGroup(['Business']);
        if (parts.length > 0) {
          subClauses.push(parts.join(' OR '));
        }
      }

      // Retail
      if (orderTypeList.includes('RETAIL')) {
        addLikeGroup(['Retail']);
      }

      // Subscribe & Save
      if (orderTypeList.includes('SUBSCRIBE')) {
        addLikeGroup(['Subscribe']);
      }

      // Promotional
      if (orderTypeList.includes('PROMOTIONAL')) {
        const promoParts = [];
        if (hasPromotionIds) promoParts.push('(oi.promotion_ids IS NOT NULL AND array_length(oi.promotion_ids,1) > 0)');
        const likes = [];
        if (hasOrderType) { values.push('%Promo%'); likes.push(`o.order_type ILIKE $${values.length}`); }
        if (hasSalesChannel) { values.push('%Promo%'); likes.push(`o.sales_channel ILIKE $${values.length}`); }
        if (likes.length > 0) promoParts.push(`(${likes.join(' OR ')})`);
        if (promoParts.length > 0) subClauses.push(promoParts.join(' OR '));
      }

      if (subClauses.length > 0) {
        whereExtra += ` AND (${subClauses.map(s => `(${s})`).join(' OR ')})`;
      }
    }

    // Build date where clause for orders depending on time component
    const orderDateWhere = endHasTime
      ? "o.purchase_date >= $1::timestamptz AND o.purchase_date <= $2::timestamptz"
      : "o.purchase_date >= $1::timestamptz AND o.purchase_date < ($2::timestamptz + interval '1 day')";

    // Query to get sales data with product images
    const query = `
      WITH sales_data AS (
        SELECT 
          oi.seller_sku as sku,
          oi.asin,
          COALESCE(p.title, oi.title, 'Product ' || oi.asin) as product,
          p.marketplace_id,
          SUM(oi.quantity_ordered) as units,
          -- Revenue: prefer stored line total (price_amount); otherwise derive from unit prices
          SUM(
            COALESCE(
              oi.price_amount,                                        -- line total if available
              oi.listing_price * oi.quantity_ordered,                  -- unit listing price * qty
              oi.item_price * oi.quantity_ordered,                     -- unit item price * qty
              p.price * oi.quantity_ordered,                           -- fallback to product price * qty
              prod."currentPrice" * oi.quantity_ordered,                  -- fallback to Product.currentPrice * qty
              (o.order_total_amount::numeric / NULLIF(oi_sum.total_qty, 0)) * oi.quantity_ordered, -- distribute order total as last resort
              0
            )
          ) as revenue,
          COUNT(DISTINCT o.amazon_order_id) as orders,
          -- Average unit price: prefer listing_price, else derive per-unit from totals
          AVG(
            COALESCE(
              NULLIF(oi.listing_price, 0),
              CASE WHEN oi.quantity_ordered > 0 THEN (oi.item_price / NULLIF(oi.quantity_ordered,0)) END,
              CASE WHEN oi.quantity_ordered > 0 THEN (oi.price_amount / NULLIF(oi.quantity_ordered,0)) END,
              NULLIF(p.price, 0),
              NULLIF(prod."currentPrice", 0),
              0
            )
          ) as price,
          MAX(p.inventory_quantity) as stock,
          MAX(p.seller_count) as seller_count,
          MAX(p.buy_box_seller) as buy_box_seller
        FROM orders o
        INNER JOIN order_items oi ON o.amazon_order_id = oi.amazon_order_id
        LEFT JOIN products p ON oi.asin = p.asin
        LEFT JOIN "Product" prod ON oi.asin = prod.asin
        LEFT JOIN LATERAL (
          SELECT SUM(oi2.quantity_ordered) AS total_qty
          FROM order_items oi2
          WHERE oi2.amazon_order_id = o.amazon_order_id
        ) oi_sum ON true
        WHERE ${orderDateWhere}
          AND oi.asin IS NOT NULL
          ${whereExtra}
        GROUP BY 
          oi.seller_sku,
          oi.asin,
          p.title,
          oi.title,
          p.marketplace_id
      ),
      ad_agg AS (
        SELECT 
          apa.asin,
          COALESCE(SUM(am.cost), 0)::numeric(12,2) AS ad_cost,
          COALESCE(SUM(am.sales), 0)::numeric(12,2) AS ad_sales,
          CASE WHEN COALESCE(SUM(am.sales), 0) > 0 
               THEN ROUND((SUM(am.cost) / NULLIF(SUM(am.sales),0)) * 100, 2)
               ELSE NULL END AS acos
        FROM advertising_product_ads apa
        JOIN advertising_metrics am ON am.campaign_id = apa.campaign_id
        WHERE am.date >= $1::date AND am.date < ($2::date + interval '1 day')
        GROUP BY apa.asin
      )
      SELECT 
        s.sku,
        s.asin,
        s.product,
        s.marketplace_id,
        s.units::text,
        s.revenue::numeric(12,2)::text as revenue,
        s.orders::text,
        s.price::numeric(12,2)::text as price,
        a.acos,
        s.stock,
        s.seller_count,
        s.buy_box_seller,
        p2.image_url,
        p2.local_image_url,
        p2.image_source_url,
        p2.compra,
        p2.armazenagem,
        p2.frete_amazon,
        p2.custos_percentuais,
        p2.imposto_percent,
        p2.custo_variavel_percent,
        p2.margem_contribuicao_percent,
        p2.custos_manuais
      FROM sales_data s
      LEFT JOIN ad_agg a ON a.asin = s.asin
      LEFT JOIN products p2 ON p2.asin = s.asin
      ORDER BY ${sortField} ${sortDirection}
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `;

    // Add pagination params
    values.push(limitNum, offset);

    let result;
    try {
      result = await pool.query(query, values);
    } catch (e) {
      // Fallback gracefully when advertising tables are not available
      const fbValues = [startTs.toISOString(), endTs.toISOString()];
      let fbWhereExtra = '';
      // Keyword
      if (keyword && String(keyword).trim().length > 0) {
        fbValues.push(`%${String(keyword).trim()}%`);
        const idx = fbValues.length;
        fbWhereExtra += ` AND (oi.seller_sku ILIKE $${idx} OR oi.asin ILIKE $${idx} OR p.title ILIKE $${idx} OR oi.title ILIKE $${idx})`;
      }
      // Countries
      if (countryList.length > 0) {
        const marketplaceIds = countryList.map(c => marketplaceMap[c] || c).filter(Boolean);
        if (marketplaceIds.length > 0) {
          fbValues.push(marketplaceIds);
          const idx2 = fbValues.length;
          fbWhereExtra += ` AND o.marketplace_id = ANY($${idx2})`;
        }
      }
      // Brands
      if (brandList.length > 0) {
        fbValues.push(brandList);
        const idx4 = fbValues.length;
        fbWhereExtra += ` AND p.brand IS NOT NULL AND LOWER(p.brand) = ANY($${idx4})`;
      }
      // Order types (extended)
      if (orderTypeList.length > 0) {
        const subClauses = [];
        if (hasFulfillment) {
          const fc = [];
          if (orderTypeList.includes('FBA')) fc.push('AFN');
          if (orderTypeList.includes('FBM')) fc.push('MFN');
          if (fc.length > 0) {
            fbValues.push(fc);
            const i = fbValues.length;
            subClauses.push(`o.fulfillment_channel = ANY($${i})`);
          }
        }
        const addLikeGroupFB = (labels) => {
          const likes = [];
          for (const label of labels) {
            if (hasOrderType) { fbValues.push(`%${label}%`); likes.push(`o.order_type ILIKE $${fbValues.length}`); }
            if (hasSalesChannel) { fbValues.push(`%${label}%`); likes.push(`o.sales_channel ILIKE $${fbValues.length}`); }
          }
          if (likes.length > 0) subClauses.push(`(${likes.join(' OR ')})`);
        };
        if (orderTypeList.includes('BUSINESS')) {
          const parts = [];
          if (hasIsBusiness) parts.push('o.is_business_order = true');
          addLikeGroupFB(['Business']);
          if (parts.length > 0) subClauses.push(parts.join(' OR '));
        }
        if (orderTypeList.includes('RETAIL')) addLikeGroupFB(['Retail']);
        if (orderTypeList.includes('SUBSCRIBE')) addLikeGroupFB(['Subscribe']);
        if (orderTypeList.includes('PROMOTIONAL')) {
          const promoParts = [];
          if (hasPromotionIds) promoParts.push('(oi.promotion_ids IS NOT NULL AND array_length(oi.promotion_ids,1) > 0)');
          const likes = [];
          if (hasOrderType) { fbValues.push('%Promo%'); likes.push(`o.order_type ILIKE $${fbValues.length}`); }
          if (hasSalesChannel) { fbValues.push('%Promo%'); likes.push(`o.sales_channel ILIKE $${fbValues.length}`); }
          if (likes.length > 0) promoParts.push(`(${likes.join(' OR ')})`);
          if (promoParts.length > 0) subClauses.push(promoParts.join(' OR '));
        }
        if (subClauses.length > 0) {
          fbWhereExtra += ` AND (${subClauses.map(s => `(${s})`).join(' OR ')})`;
        }
      }


      const fallbackQuery = `
        WITH sales_data AS (
          SELECT 
            oi.seller_sku as sku,
            oi.asin,
            COALESCE(p.title, oi.title, 'Product ' || oi.asin) as product,
            p.marketplace_id,
            SUM(oi.quantity_ordered) as units,
            -- Revenue with robust fallbacks
            SUM(
              COALESCE(
                oi.price_amount,
                oi.listing_price * oi.quantity_ordered,
                oi.item_price * oi.quantity_ordered,
                p.price * oi.quantity_ordered,
                prod."currentPrice" * oi.quantity_ordered,
                (o.order_total_amount::numeric / NULLIF(oi_sum.total_qty, 0)) * oi.quantity_ordered,
                0
              )
            ) as revenue,
            COUNT(DISTINCT o.amazon_order_id) as orders,
            -- Average unit price with robust fallbacks
            AVG(
              COALESCE(
                NULLIF(oi.listing_price, 0),
                CASE WHEN oi.quantity_ordered > 0 THEN (oi.item_price / NULLIF(oi.quantity_ordered,0)) END,
                CASE WHEN oi.quantity_ordered > 0 THEN (oi.price_amount / NULLIF(oi.quantity_ordered,0)) END,
                NULLIF(p.price, 0),
                NULLIF(prod."currentPrice", 0),
                0
              )
            ) as price,
            MAX(p.inventory_quantity) as stock,
            MAX(p.seller_count) as seller_count,
            MAX(p.buy_box_seller) as buy_box_seller
          FROM orders o
          INNER JOIN order_items oi ON o.amazon_order_id = oi.amazon_order_id
          LEFT JOIN products p ON oi.asin = p.asin
          LEFT JOIN "Product" prod ON oi.asin = prod.asin
          LEFT JOIN LATERAL (
            SELECT SUM(oi2.quantity_ordered) AS total_qty
            FROM order_items oi2
            WHERE oi2.amazon_order_id = o.amazon_order_id
          ) oi_sum ON true
          WHERE 1=1
            AND ${orderDateWhere}
            AND oi.asin IS NOT NULL
            ${fbWhereExtra}
          GROUP BY 
            oi.seller_sku,
            oi.asin,
            p.title,
            oi.title,
            p.marketplace_id
        )
        SELECT 
          s.sku,
          s.asin,
          s.product,
          s.marketplace_id,
          s.units::text,
          s.revenue::numeric(12,2)::text as revenue,
          s.orders::text,
          s.price::numeric(12,2)::text as price,
          NULL::numeric as acos,
          s.stock,
          s.seller_count,
          s.buy_box_seller,
          p2.image_url,
          p2.local_image_url,
          p2.image_source_url,
          p2.compra,
          p2.armazenagem,
          p2.frete_amazon,
          p2.custos_percentuais,
          p2.imposto_percent,
          p2.custo_variavel_percent,
          p2.margem_contribuicao_percent,
          p2.custos_manuais
        FROM sales_data s
        LEFT JOIN products p2 ON p2.asin = s.asin
        ORDER BY ${sortField} ${sortDirection}
        LIMIT $${fbValues.length + 1} OFFSET $${fbValues.length + 2}
      `;
      fbValues.push(limitNum, offset);
      result = await pool.query(fallbackQuery, fbValues);
    }

    // Optional total count (for pagination UI)
    let totalItems = null;
    try {
      const countValues = [startTs.toISOString(), endTs.toISOString()];
      let countWhereExtra = '';
      if (keyword && String(keyword).trim().length > 0) {
        countValues.push(`%${String(keyword).trim()}%`);
        const idx = countValues.length;
        countWhereExtra = ` AND (oi.seller_sku ILIKE $${idx} OR oi.asin ILIKE $${idx} OR p.title ILIKE $${idx} OR oi.title ILIKE $${idx})`;
      }

      const countQuery = `
        WITH sales_data AS (
          SELECT 
            oi.seller_sku as sku,
            oi.asin,
            COALESCE(p.title, oi.title, 'Product ' || oi.asin) as product,
            p.marketplace_id,
            SUM(oi.quantity_ordered) as units,
            SUM(COALESCE(oi.price_amount, oi.item_price, 0) * oi.quantity_ordered) as revenue,
            COUNT(DISTINCT o.amazon_order_id) as orders,
            AVG(COALESCE(oi.price_amount, oi.item_price, 0)) as price
          FROM orders o
          INNER JOIN order_items oi ON o.amazon_order_id = oi.amazon_order_id
          LEFT JOIN products p ON oi.asin = p.asin
          WHERE 1=1
            AND ${orderDateWhere}
            AND oi.asin IS NOT NULL
            ${countWhereExtra}
          GROUP BY 
            oi.seller_sku,
            oi.asin,
            p.title,
            oi.title,
            p.marketplace_id
        )
        SELECT COUNT(*)::bigint AS total FROM sales_data
      `;
      const countRes = await pool.query(countQuery, countValues);
      totalItems = countRes.rows?.[0]?.total ?? null;
    } catch (e) {
      totalItems = null;
    }

    // If no sales in the period, fallback to products with images so the UI can still render items
    if (!result.rows || result.rows.length === 0) {
      try {
        const prodRes = await pool.query(`
          SELECT asin,
                 COALESCE(sku, asin) as sku,
                 COALESCE(title, 'Product ' || asin) as product,
                 marketplace_id,
                 inventory_quantity as stock,
                 seller_count,
                 buy_box_seller,
                 image_url,
                 local_image_url,
                 image_source_url
          FROM products
          WHERE asin IS NOT NULL
          ORDER BY updated_at DESC NULLS LAST
          LIMIT $1
        `, [limitNum]);
        result = {
          rows: prodRes.rows.map((p) => ({
            sku: p.sku,
            asin: p.asin,
            product: p.product,
            marketplace_id: p.marketplace_id || 'ATVPDKIKX0DER',
            units: '0',
            revenue: '0',
            orders: '0',
            price: '0',
            acos: null,
            stock: p.stock ?? 0,
            seller_count: p.seller_count ?? null,
            buy_box_seller: p.buy_box_seller ?? null,
            compra: null,
            armazenagem: null,
            frete_amazon: null,
            custos_percentuais: null,
            imposto_percent: null,
            custo_variavel_percent: null,
            margem_contribuicao_percent: null,
            custos_manuais: false,
            image_url: p.image_url,
            local_image_url: p.local_image_url,
            image_source_url: p.image_source_url,
          }))
        };
      } catch (e) {
        // ignore fallback failure – will return empty
        result = { rows: [] };
      }
    }

    // Overlay stock/sellers/buy box from products table to ensure accuracy
    try {
      const asins = Array.from(new Set((result.rows || []).map(r => r.asin).filter(Boolean)));
      if (asins.length > 0) {
        const placeholders = asins.map((_, i) => `$${i + 1}`).join(',');
        const mapRes = await pool.query(
          `SELECT asin, inventory_quantity AS stock, seller_count, buy_box_seller, image_url, local_image_url, image_source_url
           FROM products WHERE asin IN (${placeholders})`,
          asins
        );
        const overlay = new Map(mapRes.rows.map(r => [r.asin, r]));
        for (const r of result.rows) {
          const o = overlay.get(r.asin);
          if (o) {
            r.stock = o.stock;
            r.seller_count = o.seller_count;
            r.buy_box_seller = o.buy_box_seller;
            if (!r.image_url && o.image_url) r.image_url = o.image_url;
            if (!r.local_image_url && o.local_image_url) r.local_image_url = o.local_image_url;
            if (!r.image_source_url && o.image_source_url) r.image_source_url = o.image_source_url;
          }
        }
      }
    } catch (e) {
      // overlay best-effort; ignore errors
    }

    // Transform data for frontend with standardized image URLs
    const salesData = result.rows.map((row, index) => {
      const units = parseInt(row.units) || 0;
      const revenue = parseFloat(row.revenue) || 0;

      // Stock / Sellers / Buy Box from products table
      const stock = row.stock !== null && row.stock !== undefined ? Number(row.stock) : 0;
      const sellersCount = row.seller_count !== null && row.seller_count !== undefined ? Number(row.seller_count) : null;
      const buyBoxSeller = row.buy_box_seller || null;

      const normalizeRemoteUrl = (value) => {
        if (!value || typeof value !== 'string') return null;
        const trimmed = value.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith('http://')) {
          return trimmed.replace('http://', 'https://');
        }
        return trimmed;
      };

      const normalizeLocalPath = (value) => {
        if (!value || typeof value !== 'string') return null;
        const trimmed = value.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith('http')) {
          return normalizeRemoteUrl(trimmed);
        }
        return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
      };

      const localImageUrl = normalizeLocalPath(row.local_image_url);
      const productImageUrl = normalizeRemoteUrl(row.image_url);
      const sourceImageUrl = normalizeRemoteUrl(row.image_source_url);

      let resolvedImageUrl = localImageUrl || productImageUrl || sourceImageUrl;

      if (!resolvedImageUrl && row.asin) {
        try {
          const base64Id = Buffer.from(String(row.asin)).toString('base64');
          resolvedImageUrl = `/app/product-images/${base64Id}.jpg`;
        } catch (e) {
          resolvedImageUrl = null;
        }
      }

      // Costs from products table (per unit and percentages over revenue)
      const compra = row.compra !== null && row.compra !== undefined ? Number(row.compra) : null;
      const armazenagem = row.armazenagem !== null && row.armazenagem !== undefined ? Number(row.armazenagem) : null;
      const freteAmazon = row.frete_amazon !== null && row.frete_amazon !== undefined ? Number(row.frete_amazon) : null;
      const custosPercentuais = row.custos_percentuais !== null && row.custos_percentuais !== undefined ? Number(row.custos_percentuais) : null;
      const impostoPercent = row.imposto_percent !== null && row.imposto_percent !== undefined ? Number(row.imposto_percent) : null;
      const custoVariavelPercent = row.custo_variavel_percent !== null && row.custo_variavel_percent !== undefined ? Number(row.custo_variavel_percent) : null;
      const margemContribuicaoPercent = row.margem_contribuicao_percent !== null && row.margem_contribuicao_percent !== undefined ? Number(row.margem_contribuicao_percent) : null;
      const custosManuais = row.custos_manuais === true;

      const anyCostProvided = [compra, armazenagem, freteAmazon, custosPercentuais, impostoPercent, custoVariavelPercent]
        .some(v => typeof v === 'number' && !Number.isNaN(v));

      let profit = null;
      let roi = null;

      if (anyCostProvided || custosManuais) {
        const perUnitCost = (compra || 0) + (armazenagem || 0) + (freteAmazon || 0);
        const pctSum = (custosPercentuais || 0) + (impostoPercent || 0) + (custoVariavelPercent || 0);
        const variableCosts = revenue * (pctSum / 100);
        const cogsTotal = (perUnitCost * units) + variableCosts;
        profit = revenue - cogsTotal;
        roi = cogsTotal > 0 ? (profit / cogsTotal) * 100 : null;
      }
      
      return {
        id: `${row.asin}-${index}`,
        sku: row.sku || row.asin,
        asin: row.asin,
        title: row.product,
        product: row.product,
        image_url: resolvedImageUrl,
        imageUrl: resolvedImageUrl,
        local_image_url: localImageUrl,
        image_source_url: sourceImageUrl,
        marketplace_id: row.marketplace_id || 'ATVPDKIKX0DER',
        units,
        revenue,
        orders: parseInt(row.orders) || 0,
        price: parseFloat(row.price) || 0,
        profit,
        roi,
        acos: row.acos !== null && row.acos !== undefined ? Number(row.acos) : null,
        health: 'good',
        stock: stock,
        buy_box_winner: buyBoxSeller,
        sellers: sellersCount,
        costs: {
          compra,
          armazenagem,
          frete_amazon: freteAmazon,
          custos_percentuais: custosPercentuais,
          imposto_percent: impostoPercent,
          custo_variavel_percent: custoVariavelPercent,
          margem_contribuicao_percent: margemContribuicaoPercent,
          custos_manuais: custosManuais,
        }
      };
    });
    
    res.json({
      success: true,
      data: salesData,
      pagination: {
        total: totalItems ?? salesData.length,
        page: pageNum,
        limit: limitNum,
        pages: totalItems ? Math.max(Math.ceil(totalItems / limitNum), 1) : 1,
      }
    });
    
  } catch (error) {
    console.error('Error in sales-simple:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch sales data',
      message: error.message 
    });
  }
});

module.exports = router;