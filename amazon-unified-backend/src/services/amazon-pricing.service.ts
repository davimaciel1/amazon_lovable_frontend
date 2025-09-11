// eslint-disable-next-line @typescript-eslint/no-var-requires
const SellingPartner = require('amazon-sp-api');
import { pool } from '../config/database';
import { logger } from '../utils/logger';

export class AmazonPricingService {
  private sp: any | null = null;
  private marketplaceId = process.env.AMAZON_MARKETPLACE_ID || 'ATVPDKIKX0DER';

  constructor() {
    // Require SigV4 credentials; if missing, keep null and skip
    const hasSigV4 = !!(
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.AWS_SELLING_PARTNER_ROLE &&
      process.env.SP_API_CLIENT_ID &&
      process.env.SP_API_CLIENT_SECRET &&
      process.env.SP_API_REFRESH_TOKEN
    );

    if (!hasSigV4) {
      logger.warn('AmazonPricingService disabled: SigV4/IAM credentials not configured');
      this.sp = null;
      return;
    }

    try {
      this.sp = new (SellingPartner as any)({
        region: 'na',
        refresh_token: process.env.SP_API_REFRESH_TOKEN,
        credentials: {
          SELLING_PARTNER_APP_CLIENT_ID: process.env.SP_API_CLIENT_ID,
          SELLING_PARTNER_APP_CLIENT_SECRET: process.env.SP_API_CLIENT_SECRET,
          AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
          AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
          AWS_SELLING_PARTNER_ROLE: process.env.AWS_SELLING_PARTNER_ROLE,
        },
      });
    } catch (e) {
      logger.error('Failed to initialize SellingPartner for pricing service:', e);
      this.sp = null;
    }
  }

  isEnabled(): boolean {
    return !!this.sp;
  }

  async updateOffersForAsins(asins: string[]): Promise<{ updated: number; errors: number }> {
    if (!this.sp) {
      logger.warn('AmazonPricingService not enabled; skipping offers update');
      return { updated: 0, errors: 0 };
    }

    let updated = 0;
    let errors = 0;

    for (const asin of asins) {
      try {
        const resp = await this.sp.callAPI({
          operation: 'getItemOffers',
          endpoint: 'productPricing',
          path: `/products/pricing/v0/items/${asin}/offers`,
          query: {
            MarketplaceId: this.marketplaceId,
            ItemCondition: 'New',
          },
        });

        const offers = resp?.payload?.Offers || [];
        const sellerCount = Array.isArray(offers) ? offers.length : 0;
        let buyBoxSeller: string | null = null;
        const winner = offers.find((o: any) => o?.IsBuyBoxWinner === true) || null;
        if (winner) {
          // Prefer SellerId or SellerSKU or storefront name if present
          buyBoxSeller = winner.SellerId || winner.SellerSKU || winner.Shipping?.FulfillmentType || 'Unknown';
        }

        await pool.query(
          `UPDATE products 
           SET seller_count = $1, buy_box_seller = $2, updated_at = NOW() 
           WHERE asin = $3`,
          [sellerCount || null, buyBoxSeller, asin]
        );
        updated++;

        // Pacing
        await new Promise((r) => setTimeout(r, 600));
      } catch (e: any) {
        errors++;
        // Backoff on 429
        if (e?.response?.status === 429) {
          await new Promise((r) => setTimeout(r, 5000));
        }
        logger.warn(`Offers update failed for ${asin}: ${e?.message || e}`);
      }
    }

    return { updated, errors };
  }

  async updateAllKnownAsins(limit = 100): Promise<{ updated: number; errors: number; total: number }> {
    const asinsRes = await pool.query(
      `SELECT DISTINCT asin FROM products WHERE asin IS NOT NULL ORDER BY updated_at DESC NULLS LAST, asin LIMIT $1`,
      [limit]
    );
    const asins = asinsRes.rows.map((r: any) => r.asin);
    const res = await this.updateOffersForAsins(asins);
    return { ...res, total: asins.length };
  }
}

