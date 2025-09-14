import axios from 'axios';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

interface MlCreds {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  sellerId: string;
}

class MercadoLivreSyncService {
  private accessToken: string | null = null;
  private accessTokenExpiry: number | null = null; // epoch ms

  private async getCredentials(): Promise<MlCreds> {
    const res = await pool.query(
      `SELECT credential_key, credential_value FROM ml_credentials WHERE is_active = true`
    );
    const map: Record<string, string> = {};
    for (const r of res.rows) map[r.credential_key] = r.credential_value;

    const clientId = map.ML_CLIENT_ID || process.env.ML_CLIENT_ID;
    const clientSecret = map.ML_CLIENT_SECRET || process.env.ML_CLIENT_SECRET;
    const refreshToken = map.ML_REFRESH_TOKEN;
    const sellerId = map.ML_SELLER_ID || map.ML_USER_ID;

    if (!clientId || !clientSecret || !refreshToken || !sellerId) {
      throw new Error('Missing Mercado Livre credentials (ML_CLIENT_ID/ML_CLIENT_SECRET/ML_REFRESH_TOKEN/ML_SELLER_ID)');
    }
    return { clientId, clientSecret, refreshToken, sellerId };
  }

  private async upsertCredential(key: string, value: string) {
    await pool.query(
      `INSERT INTO ml_credentials (credential_key, credential_value, is_active, updated_at)
       VALUES ($1,$2,true,NOW())
       ON CONFLICT (credential_key)
       DO UPDATE SET credential_value = EXCLUDED.credential_value, is_active = true, updated_at = NOW()`,
      [key, value]
    );
  }

  private async refreshAccessToken(force = false): Promise<string> {
    if (!force && this.accessToken && this.accessTokenExpiry && Date.now() < this.accessTokenExpiry) {
      return this.accessToken;
    }

    const { clientId, clientSecret, refreshToken } = await this.getCredentials();

    const params = new URLSearchParams();
    params.set('grant_type', 'refresh_token');
    params.set('client_id', clientId);
    params.set('client_secret', clientSecret);
    params.set('refresh_token', refreshToken);

    const resp = await axios.post('https://api.mercadolibre.com/oauth/token', params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    });

    const data = resp.data || {};
    this.accessToken = data.access_token;
    const expiresInSec = Number(data.expires_in || 0);
    // cache token for a bit less than expires
    this.accessTokenExpiry = Date.now() + Math.max(0, (expiresInSec - 60) * 1000);

    // If provider rotates refresh tokens, persist the new one
    const newRefresh: string | undefined = (data as any).refresh_token;
    if (newRefresh && newRefresh !== refreshToken) {
      await this.upsertCredential('ML_REFRESH_TOKEN', newRefresh);
    }
    // persist the latest access token and its expiry hint (optional)
    if (this.accessToken) await this.upsertCredential('ML_ACCESS_TOKEN', this.accessToken);
    if (expiresInSec) await this.upsertCredential('ML_ACCESS_TOKEN_EXPIRES_IN', String(expiresInSec));

    return this.accessToken!;
  }

  private async getAccessToken(): Promise<string> {
    try {
      return await this.refreshAccessToken(false);
    } catch (e) {
      // try once forcing refresh
      logger.warn('Failed cached ML access token, forcing refresh');
      return await this.refreshAccessToken(true);
    }
  }

  private buildSearchUrl(params: Record<string, string | number | undefined>): string {
    const u = new URL('https://api.mercadolibre.com/orders/search');
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      u.searchParams.set(k, String(v));
    });
    return u.toString();
  }

  private mapOrderForDb(o: any) {
    // Extract logistic information from shipping data
    const shipping = o.shipping || {};
    const logistic = shipping.logistic || {};
    
    // Determine fulfillment type based on ML API documentation
    // FULL = meli_facility (fulfillment), FLEX = selling_address (self_service)
    let fulfillmentType = 'OTHER';
    
    // Check tags for fulfillment indicators
    const tags = Array.isArray(o.tags) ? o.tags : [];
    const hasSelfServiceTag = tags.some((tag: any) => String(tag).toLowerCase().includes('self_service'));
    const hasFulfillmentTag = tags.some((tag: any) => String(tag).toLowerCase().includes('fulfillment'));
    
    // Primary detection: Based on logistic type and tags
    const logisticTypeStr = String(logistic.type || '').toLowerCase();
    
    if (logisticTypeStr === 'fulfillment' || hasFulfillmentTag) {
      fulfillmentType = 'FULL';
    } else if (logisticTypeStr === 'self_service' || hasSelfServiceTag || logisticTypeStr === 'drop_off') {
      fulfillmentType = 'FLEX';
    }
    
    // Secondary detection: Check shipping service information
    if (fulfillmentType === 'OTHER' && shipping.service_id) {
      // Service IDs can help identify fulfillment type
      // This may need adjustment based on actual API responses
      const serviceId = Number(shipping.service_id);
      if (serviceId && serviceId > 0) {
        // For now, default FLEX for active shipping services
        // This needs refinement based on actual ML data
        fulfillmentType = 'FLEX';
      }
    }
    
    return {
      ml_order_id: o.id,
      seller_id: o.seller?.id ?? o.seller_id ?? null,
      buyer_id: o.buyer?.id ?? o.buyer_id ?? null,
      pack_id: o.pack_id ?? null,
      pickup_id: o.pickup_id ?? null,
      shipping_id: shipping.id ?? null,
      site_id: o.site_id ?? o.context?.site ?? null,
      channel: o.context?.channel ?? null,
      status: o.status ?? null,
      status_detail: o.status_detail ?? null,
      total_amount: o.total_amount ?? null,
      paid_amount: o.paid_amount ?? null,
      coupon_amount: o.coupon?.amount ?? null,
      currency_id: o.currency_id ?? null,
      taxes_amount: o.taxes?.amount ?? null,
      date_created: o.date_created ?? null,
      date_closed: o.date_closed ?? null,
      last_updated: o.last_updated ?? null,
      tags: tags,
      // Enhanced fulfillment detection
      logistic_type: logisticTypeStr || null,
      logistic_mode: logistic.mode ? String(logistic.mode).toLowerCase() : null,
      raw: o,
    };
  }

  private async upsertOrder(o: any) {
    const q = `
      INSERT INTO ml_orders (
        ml_order_id, seller_id, buyer_id, pack_id, pickup_id, shipping_id, site_id, channel,
        status, status_detail, total_amount, paid_amount, coupon_amount, currency_id, taxes_amount,
        date_created, date_closed, last_updated, tags, logistic_type, logistic_mode, raw, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,
        $9,$10,$11,$12,$13,$14,$15,
        $16,$17,$18,$19,$20,$21,$22,NOW(),NOW()
      )
      ON CONFLICT (ml_order_id) DO UPDATE SET
        seller_id = EXCLUDED.seller_id,
        buyer_id = EXCLUDED.buyer_id,
        pack_id = EXCLUDED.pack_id,
        pickup_id = EXCLUDED.pickup_id,
        shipping_id = EXCLUDED.shipping_id,
        site_id = EXCLUDED.site_id,
        channel = EXCLUDED.channel,
        status = EXCLUDED.status,
        status_detail = EXCLUDED.status_detail,
        total_amount = EXCLUDED.total_amount,
        paid_amount = EXCLUDED.paid_amount,
        coupon_amount = EXCLUDED.coupon_amount,
        currency_id = EXCLUDED.currency_id,
        taxes_amount = EXCLUDED.taxes_amount,
        date_created = EXCLUDED.date_created,
        date_closed = EXCLUDED.date_closed,
        last_updated = EXCLUDED.last_updated,
        tags = EXCLUDED.tags,
        logistic_type = EXCLUDED.logistic_type,
        logistic_mode = EXCLUDED.logistic_mode,
        raw = EXCLUDED.raw,
        updated_at = NOW();
    `;
    const m = this.mapOrderForDb(o);
    const params = [
      m.ml_order_id, m.seller_id, m.buyer_id, m.pack_id, m.pickup_id, m.shipping_id, m.site_id, m.channel,
      m.status, m.status_detail, m.total_amount, m.paid_amount, m.coupon_amount, m.currency_id, m.taxes_amount,
      m.date_created, m.date_closed, m.last_updated, m.tags, m.logistic_type, m.logistic_mode, m.raw
    ];
    await pool.query(q, params);

    // Replace items
    await pool.query('DELETE FROM ml_order_items WHERE ml_order_id = $1', [m.ml_order_id]);
    const items: any[] = Array.isArray(o.order_items) ? o.order_items : [];
    for (const it of items) {
      const item = it.item || {};
      const insertItem = `
        INSERT INTO ml_order_items (
          ml_order_id, item_id, title, category_id, variation_id, seller_sku,
          quantity, unit_price, full_unit_price, currency_id, sale_fee, listing_type_id,
          variation_attributes, raw
        ) VALUES (
          $1,$2,$3,$4,$5,$6,
          $7,$8,$9,$10,$11,$12,
          $13,$14
        );
      `;
      const paramsItem = [
        m.ml_order_id,
        item.id ?? null,
        item.title ?? null,
        item.category_id ?? null,
        item.variation_id ?? null,
        item.seller_sku ?? null,
        it.quantity ?? null,
        it.unit_price ?? null,
        it.full_unit_price ?? null,
        it.currency_id ?? null,
        it.sale_fee ?? null,
        it.listing_type_id ?? null,
        JSON.stringify(item.variation_attributes || []),
        JSON.stringify(it)
      ];
      await pool.query(insertItem, paramsItem);
    }
  }

  async syncByDateRange(fromIso?: string, toIso?: string, status: string = 'paid') {
    const { sellerId } = await this.getCredentials();
    const accessToken = await this.getAccessToken();

    let offset = 0;
    const limit = 50;
    let total = 0;
    let synced = 0;

    // Use appropriate date field based on status
    const dateField = status === 'paid' ? 'order.date_closed' : 'order.date_last_updated';
    const fromParam = `${dateField}.from`;
    const toParam = `${dateField}.to`;

    for (let page = 0; page < 200; page++) { // hard cap pages as safety
      const url = this.buildSearchUrl({
        seller: sellerId,
        'order.status': status,
        ...(fromIso ? { [fromParam]: fromIso } : {}),
        ...(toIso ? { [toParam]: toIso } : {}),
        offset,
        limit,
      });

      const resp = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 30000,
        validateStatus: () => true,
      });
      if (resp.status === 401 || resp.status === 400) {
        // try refresh once
        await this.refreshAccessToken(true);
        continue;
      }
      if (resp.status >= 500) {
        logger.warn(`ML orders search 5xx: ${resp.status}`);
        break;
      }
      if (resp.status !== 200) {
        throw new Error(`ML orders search error ${resp.status}: ${JSON.stringify(resp.data)}`);
      }

      const data = resp.data || {};
      const results: any[] = data.results || [];
      const paging = data.paging || {};
      total = typeof paging.total === 'number' ? paging.total : results.length;

      for (const order of results) {
        try {
          await this.upsertOrder(order);
          synced++;
        } catch (e) {
          logger.error('Failed to upsert ML order', { id: order?.id, error: (e as Error).message });
        }
      }

      if (!paging || typeof paging.offset !== 'number' || typeof paging.limit !== 'number') {
        // no paging info; stop after this batch
        break;
      }
      offset = paging.offset + paging.limit;
      if (offset >= total) break;
    }

    // If no results with primary date field, try fallback with order.date_created
    if (total === 0 && synced === 0 && fromIso && toIso && status === 'paid') {
      logger.info(`[ML Sync] No results with ${dateField}, trying fallback with order.date_created`);
      
      offset = 0;
      for (let page = 0; page < 200; page++) {
        const fallbackUrl = this.buildSearchUrl({
          seller: sellerId,
          'order.status': status,
          'order.date_created.from': fromIso,
          'order.date_created.to': toIso,
          offset,
          limit,
        });

        const resp = await axios.get(fallbackUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 30000,
          validateStatus: () => true,
        });
        
        if (resp.status !== 200) break;

        const data = resp.data || {};
        const results: any[] = data.results || [];
        const paging = data.paging || {};
        
        if (results.length === 0) break;
        
        for (const order of results) {
          try {
            await this.upsertOrder(order);
            synced++;
          } catch (e) {
            logger.error('Failed to upsert ML order (fallback)', { id: order?.id, error: (e as Error).message });
          }
        }

        if (!paging || typeof paging.offset !== 'number' || typeof paging.limit !== 'number') break;
        offset = paging.offset + paging.limit;
        if (offset >= (paging.total || results.length)) break;
      }
    }

    return { total, synced };
  }

  async syncLastDays(days: number = 30, status: string = 'paid') {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    return this.syncByDateRange(from.toISOString(), to.toISOString(), status);
  }
}

export const mercadoLivreSyncService = new MercadoLivreSyncService();

