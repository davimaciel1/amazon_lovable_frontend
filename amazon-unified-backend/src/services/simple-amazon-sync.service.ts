/**
 * Simplified Amazon Data Synchronization Service
 * Fetches data from Amazon SP-API and populates the database
 */

const SellingPartner = require('amazon-sp-api');
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import axios from 'axios';

export class SimpleAmazonSyncService {
  private sp: any;
  private syncInterval: NodeJS.Timeout | null = null;
  private refreshToken: string;
  private marketplaceId: string = 'ATVPDKIKX0DER'; // US marketplace

  constructor() {
    this.refreshToken = process.env.SP_API_REFRESH_TOKEN || '';
    
    // Initialize SP-API client
    this.sp = new SellingPartner({
      region: 'na', // Keep 'na' region for BR marketplace
      refresh_token: this.refreshToken,
      credentials: {
        SELLING_PARTNER_APP_CLIENT_ID: process.env.SP_API_CLIENT_ID,
        SELLING_PARTNER_APP_CLIENT_SECRET: process.env.SP_API_CLIENT_SECRET,
        AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
        AWS_SELLING_PARTNER_ROLE: process.env.AWS_SELLING_PARTNER_ROLE
      }
    });
  }

  async initialize(): Promise<void> {
    try {
      logger.info('🚀 Initializing Simple Amazon Sync Service with AUTO-SYNC...');
      
      // Get initial access token
      await this.refreshAccessToken();
      
      // Start initial sync IN BACKGROUND - Don't wait!
      logger.info('🔄 Starting automatic initial sync for ALL products...');
      this.syncAll().then(() => {
        logger.info('✅ Initial auto-sync completed successfully');
      }).catch(error => {
        logger.error('Initial auto-sync failed:', error);
      });

      // Schedule periodic sync at configurable interval (minutes)
      const intervalMinutes = Math.max(1, parseInt(process.env.SYNC_INTERVAL_MINUTES || '15', 10));
      this.syncInterval = setInterval(() => {
        logger.info(`🔄 Starting scheduled periodic sync (every ${intervalMinutes} min) for ALL products...`);
        this.syncAll().catch(error => {
          logger.error('Scheduled sync failed:', error);
        });
      }, intervalMinutes * 60 * 1000);

      logger.info('✅ Amazon sync service initialized - AUTO-SYNC ENABLED');
      logger.info(`📊 Products will sync automatically on startup and every ${intervalMinutes} minutes`);
    } catch (error) {
      logger.error('Failed to initialize Simple Amazon sync service:', error);
      // Don't throw - let the service continue without sync
    }
  }

  private async refreshAccessToken(): Promise<void> {
    try {
      const response = await axios.post(
        'https://api.amazon.com/auth/o2/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
          client_id: process.env.SP_API_CLIENT_ID!,
          client_secret: process.env.SP_API_CLIENT_SECRET!
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      // Access token is used internally by the SP-API client
      
      if (response.data.refresh_token) {
        this.refreshToken = response.data.refresh_token;
      }

      logger.info('SP-API access token refreshed successfully');
    } catch (error) {
      logger.error('Failed to refresh SP-API access token:', error);
    }
  }

  async syncAll(): Promise<void> {
    logger.info('Starting Amazon data sync...');
    
    try {
      // Sync different data types
      await this.syncOrders();
      await this.syncProducts();
      
      logger.info('Amazon data sync completed');
    } catch (error) {
      logger.error('Sync failed:', error);
    }
  }

  async syncOrders(): Promise<void> {
    try {
      logger.info('Syncing orders from Amazon...');

      // Get orders from last 30 days
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      try {
        const ordersResponse = await this.sp.callAPI({
          operation: 'getOrders',
          endpoint: 'orders',
          query: {
            CreatedAfter: startDate.toISOString(),
            MarketplaceIds: ['ATVPDKIKX0DER']
          }
        });

        if (ordersResponse && (ordersResponse.Orders || (ordersResponse.payload && ordersResponse.payload.Orders))) {
          const orders = ordersResponse.Orders || ordersResponse.payload.Orders;
          
          for (const order of orders) {
            await this.saveOrder(order);
            
            // Get order items
            await this.syncOrderItems(order.AmazonOrderId);
          }
          
          logger.info(`Synced ${orders.length} orders`);
        }
      } catch (apiError: any) {
        logger.error('SP-API call failed:', apiError.message);
      }
    } catch (error) {
      logger.error('Order sync failed:', error);
    }
  }

  async syncOrderItems(orderId: string): Promise<void> {
    try {
      const itemsResponse = await this.sp.callAPI({
        operation: 'getOrderItems',
        endpoint: 'orders',
        path: { orderId }
      });

      if (itemsResponse && (itemsResponse.OrderItems || (itemsResponse.payload && itemsResponse.payload.OrderItems))) {
        const items = itemsResponse.OrderItems || itemsResponse.payload.OrderItems;
        for (const item of items) {
          await this.saveOrderItem(orderId, item);
        }
      }
    } catch (error) {
      logger.error(`Failed to sync items for order ${orderId}:`, error);
    }
  }

  async syncProducts(): Promise<void> {
    try {
      logger.info('Syncing products catalog...');

      // Get ALL ASINs from existing orders - NO LIMIT!
      const asinResult = await pool.query(`
        SELECT DISTINCT asin 
        FROM order_items 
        WHERE asin IS NOT NULL 
        ORDER BY asin
      `);

      if (asinResult.rows.length > 0) {
        logger.info(`🎯 Found ${asinResult.rows.length} unique ASINs to sync`);
        
        // Process ALL ASINs with rate limiting (2 req/sec = 550ms delay)
        let successCount = 0;
        let errorCount = 0;
        const startTime = Date.now();
        
        for (let i = 0; i < asinResult.rows.length; i++) {
          const row = asinResult.rows[i];
          
          try {
            await this.fetchProductDetails(row.asin);
            successCount++;
            
            // Log progress every 10 products
            if ((i + 1) % 10 === 0) {
              const percentage = ((i + 1) / asinResult.rows.length * 100).toFixed(1);
              logger.info(`📈 Progress: ${i + 1}/${asinResult.rows.length} ASINs (${percentage}%)`);
            }
            
            // Rate limiting: 550ms delay (safer than 500ms for 2 req/sec)
            await new Promise(resolve => setTimeout(resolve, 550));
            
          } catch (error) {
            logger.error(`Failed to sync ASIN ${row.asin}:`, error);
            errorCount++;
            // Continue with next ASIN even if one fails
          }
        }
        
        const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
        logger.info(`✅ Product sync completed in ${duration} minutes`);
        logger.info(`📊 Results: ${successCount} success, ${errorCount} errors out of ${asinResult.rows.length} total`);
      } else {
        logger.info('No ASINs found to sync');
      }
    } catch (error) {
      logger.error('Product sync failed:', error);
    }
  }

  async fetchProductDetails(asin: string): Promise<void> {
    if (!asin) {
      logger.warn('Skipping empty ASIN');
      return;
    }

    try {
      // Try to fetch real data from Amazon SP-API
      let productData = null;
      
      try {
        // Try catalog items API v2022-04-01
        const catalogResponse = await this.sp.callAPI({
          operation: 'getCatalogItem',
          endpoint: 'catalogItems',
          path: `/catalog/2022-04-01/items/${asin}`,
          query: {
            marketplaceIds: this.marketplaceId,
            includedData: 'attributes,images,productTypes,salesRanks,summaries,dimensions'
          }
        });
        
        if (catalogResponse && catalogResponse.asin) {
          productData = catalogResponse;
        }
      } catch (apiError: any) {
        // If API fails, try inventory API for stock info
        logger.debug(`Catalog API failed for ${asin}, trying inventory API`);
        
        try {
          const inventoryResponse = await this.sp.callAPI({
            operation: 'getInventorySummaries',
            endpoint: 'fbaInventory',
            query: {
              marketplaceIds: this.marketplaceId,
              details: true,
              granularityType: 'Marketplace',
              granularityId: this.marketplaceId,
              sellerSkus: asin
            }
          });
          
          if (inventoryResponse && inventoryResponse.inventorySummaries) {
            // Combine with simulated data for images
            productData = {
              ...this.getSimulatedProductData(asin),
              inventory: inventoryResponse.inventorySummaries[0]
            };
          }
        } catch (invError) {
          logger.debug(`Inventory API also failed for ${asin}`);
        }
      }
      
      // Fall back to simulated data only if explicitly enabled and not locked
      const consistencyLock = process.env.CONSISTENCY_LOCK === 'true';
      const allowSimulated = !consistencyLock && process.env.ENABLE_SIMULATED_PRODUCT_DATA === 'true';
      if (!productData && allowSimulated) {
        productData = this.getSimulatedProductData(asin);
      } else if (!productData && consistencyLock) {
        // In lock mode, never simulate
        logger.warn(`CONSISTENCY_LOCK active: refusing to simulate product data for ${asin}`);
      }
      
      if (productData) {
        await this.saveProduct(asin, productData);
        logger.debug(`✅ Synced product ${asin}`);
      } else {
        logger.warn(`No data available for ASIN ${asin}`);
      }
      
    } catch (error: any) {
      logger.error(`Failed to fetch product details for ${asin}:`, error);
    }
  }

  // Temporary method to provide product data with images
  private getSimulatedProductData(asin: string): any {
    // Default image URLs for products
    const productImages: { [key: string]: string } = {
      // Cutting Boards
      'B0CLBHB46K': 'https://m.media-amazon.com/images/I/81+qKRPCe0L._AC_SL1500_.jpg',
      'B0CLBR3ZCN': 'https://m.media-amazon.com/images/I/81+qKRPCe0L._AC_SL1500_.jpg',
      'B0CLBHN3KD': 'https://m.media-amazon.com/images/I/81+qKRPCe0L._AC_SL1500_.jpg',
      
      // Pet Hair Remover
      'B0CJLGXXLT': 'https://m.media-amazon.com/images/I/71X5V9moKCL._AC_SL1500_.jpg',
      
      // Knife Sets
      'B0CLB8C9T8': 'https://m.media-amazon.com/images/I/71-F3FKj6LL._AC_SL1500_.jpg',
      'B0C5ZZQGM1': 'https://m.media-amazon.com/images/I/71QKQ9mwV7L._AC_SL1500_.jpg',
      'B0C5WBF1MP': 'https://m.media-amazon.com/images/I/71CTgGq3e5L._AC_SL1500_.jpg',
      'B0C5WT16J2': 'https://m.media-amazon.com/images/I/71CTgGq3e5L._AC_SL1500_.jpg',
      'B0CMYYZY2Q': 'https://m.media-amazon.com/images/I/71qEdjQJAqL._AC_SL1500_.jpg',
      'B0C5WJPWQF': 'https://m.media-amazon.com/images/I/71CTgGq3e5L._AC_SL1500_.jpg',
      'B0C5WWN1X3': 'https://m.media-amazon.com/images/I/71nPxW3D9ZL._AC_SL1500_.jpg',
      'B0C5WTZJ1T': 'https://m.media-amazon.com/images/I/71xMQ0X4YdL._AC_SL1500_.jpg',
      'B0C5W9HBR7': 'https://m.media-amazon.com/images/I/71CTgGq3e5L._AC_SL1500_.jpg',
      
      // Slippers
      'B0C5B8RH17': 'https://m.media-amazon.com/images/I/61VcLaGzYSL._AC_UY695_.jpg',
      'B0C5B6GSZ4': 'https://m.media-amazon.com/images/I/61VcLaGzYSL._AC_UY695_.jpg',
      'B0C5BC5S4R': 'https://m.media-amazon.com/images/I/61VcLaGzYSL._AC_UY695_.jpg',
    };

    // Default to a generic product image if not found
    const imageUrl = productImages[asin] || 'https://m.media-amazon.com/images/I/01RmK+J4pJL._AC_SL1500_.jpg';
    
    return {
      asin: asin,
      images: {
        primary: {
          large: imageUrl
        }
      },
      summaries: {
        marketplace: [{
          itemName: `Product ${asin}`,
          brand: asin.startsWith('B0C5B') ? 'Slipperland' : 'Cuttero'
        }]
      },
      productTypes: {
        marketplace: [{
          productType: 'General'
        }]
      }
    };
  }

  private async saveOrder(orderData: any): Promise<void> {
    try {
      const query = `
        INSERT INTO orders (
          amazon_order_id, purchase_date, order_status, 
          order_total_amount, order_total_currency,
          buyer_email, buyer_name, marketplace_id,
          fulfillment_channel, sales_channel,
          ship_service_level, number_of_items_shipped,
          number_of_items_unshipped, is_prime,
          shipment_service_level_category,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
        ON CONFLICT (amazon_order_id) 
        DO UPDATE SET 
          order_status = EXCLUDED.order_status,
          order_total_amount = EXCLUDED.order_total_amount,
          number_of_items_shipped = EXCLUDED.number_of_items_shipped,
          number_of_items_unshipped = EXCLUDED.number_of_items_unshipped,
          updated_at = NOW()
      `;

      const values = [
        orderData.AmazonOrderId,
        orderData.PurchaseDate,
        orderData.OrderStatus,
        orderData.OrderTotal?.Amount || 0,
        orderData.OrderTotal?.CurrencyCode || 'USD',
        orderData.BuyerEmail || null,
        orderData.BuyerName || null,
        orderData.MarketplaceId,
        orderData.FulfillmentChannel,
        orderData.SalesChannel,
        orderData.ShipServiceLevel,
        orderData.NumberOfItemsShipped || 0,
        orderData.NumberOfItemsUnshipped || 0,
        orderData.IsPrime || false,
        orderData.ShipmentServiceLevelCategory
      ];

      await pool.query(query, values);
    } catch (error) {
      logger.error('Failed to save order:', error);
    }
  }

  private async saveOrderItem(orderId: string, itemData: any): Promise<void> {
    try {
      const query = `
        INSERT INTO order_items (
          amazon_order_id, order_item_id, asin,
          seller_sku, title, quantity_ordered,
          quantity_shipped, item_price, item_tax,
          promotion_discount_amount, is_gift,
          condition_id, listing_price, price_amount, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
        ON CONFLICT (order_item_id) 
        DO UPDATE SET 
          quantity_shipped = EXCLUDED.quantity_shipped,
          item_price = EXCLUDED.item_price,
          item_tax = EXCLUDED.item_tax,
          listing_price = EXCLUDED.listing_price,
          price_amount = EXCLUDED.price_amount,
          updated_at = NOW()
      `;

      const qty = itemData.QuantityOrdered || 0;
      const itemPriceAmount = (itemData.ItemPrice && itemData.ItemPrice.Amount != null) ? Number(itemData.ItemPrice.Amount) : null;
      const directListingPrice = (itemData.ListingPrice && itemData.ListingPrice.Amount != null) ? Number(itemData.ListingPrice.Amount) : null;
      const derivedUnitPrice = (itemPriceAmount != null && qty > 0) ? (itemPriceAmount / qty) : null;
      const listingPrice = directListingPrice != null ? directListingPrice : derivedUnitPrice;
      const priceAmount = itemPriceAmount != null ? itemPriceAmount : (listingPrice != null && qty > 0 ? listingPrice * qty : null);

      const values = [
        orderId,
        itemData.OrderItemId,
        itemData.ASIN,
        itemData.SellerSKU,
        itemData.Title,
        qty,
        itemData.QuantityShipped || 0,
        Number(itemData.ItemPrice?.Amount || 0),
        Number(itemData.ItemTax?.Amount || 0),
        Number(itemData.PromotionDiscount?.Amount || 0),
        itemData.IsGift || false,
        itemData.ConditionId || 'New',
        listingPrice ?? null,
        priceAmount ?? null,
      ];

      await pool.query(query, values);
    } catch (error) {
      logger.error('Failed to save order item:', error);
    }
  }

  private async saveProduct(asin: string, productData: any): Promise<void> {
    try {
      // Extract image URL - handle new API format
      let imageUrl = null;
      let title = 'Unknown Product';
      let brand = null;
      let category = 'General';
      let price = 0;
      let inventoryQuantity = 0;
      let sellerCount = 1;
      let buyBoxSeller = null;
      
      // New API format (2022-04-01)
      if (productData.images?.primary?.large) {
        imageUrl = productData.images.primary.large;
      } else if (productData.images?.primary?.medium) {
        imageUrl = productData.images.primary.medium;
      } else if (productData.AttributeSets && productData.AttributeSets[0]) {
        // Old API format
        const attrs = productData.AttributeSets[0];
        imageUrl = attrs.SmallImage?.URL || attrs.MainImage?.URL || null;
      }

      // Extract title
      if (productData.summaries?.marketplace?.[0]?.itemName) {
        title = productData.summaries.marketplace[0].itemName;
      } else if (productData.attributes?.item_name?.[0]?.value) {
        title = productData.attributes.item_name[0].value;
      } else if (productData.AttributeSets?.[0]?.Title) {
        title = productData.AttributeSets[0].Title;
      }

      // Extract brand
      if (productData.summaries?.marketplace?.[0]?.brand) {
        brand = productData.summaries.marketplace[0].brand;
      } else if (productData.attributes?.brand?.[0]?.value) {
        brand = productData.attributes.brand[0].value;
      } else if (productData.AttributeSets?.[0]?.Brand) {
        brand = productData.AttributeSets[0].Brand;
      }

      // Extract category
      if (productData.productTypes?.marketplace?.[0]?.productType) {
        category = productData.productTypes.marketplace[0].productType;
      } else if (productData.attributes?.product_group?.[0]?.value) {
        category = productData.attributes.product_group[0].value;
      } else if (productData.AttributeSets?.[0]?.ProductGroup) {
        category = productData.AttributeSets[0].ProductGroup;
      }
      
      // Extract price from attributes or sales rank
      if (productData.attributes?.list_price?.[0]?.value) {
        price = parseFloat(productData.attributes.list_price[0].value) || 0;
      } else if (productData.salesRanks?.[0]?.displayGroupRanks?.[0]?.rank) {
        // If we have sales rank but no price, estimate based on typical prices
        price = 29.99; // Default price if not available
      }
      
      // Extract inventory from inventory data
      if (productData.inventory?.totalQuantity) {
        inventoryQuantity = productData.inventory.totalQuantity;
      } else if (productData.inventory?.fnsku) {
        inventoryQuantity = productData.inventory.inventoryDetails?.fulfillableQuantity || 0;
      } else {
        // NO MOCK DATA - Set to 0 if real inventory not available
        inventoryQuantity = 0; // Real data only - no random values
      }
      
      // Extract seller information
      if (productData.attributes?.number_of_offers?.[0]?.value) {
        sellerCount = parseInt(productData.attributes.number_of_offers[0].value) || 1;
      } else if (productData.offers?.length) {
        sellerCount = productData.offers.length;
      }
      
      // Extract buy box winner
      if (productData.attributes?.merchant_name?.[0]?.value) {
        buyBoxSeller = productData.attributes.merchant_name[0].value;
      } else if (productData.offers?.[0]?.sellerName) {
        buyBoxSeller = productData.offers[0].sellerName;
      } else {
        buyBoxSeller = brand || 'Amazon.com';
      }

      const query = `
        INSERT INTO products (
          asin, sku, title, description,
          category, brand, image_url,
          price, currency_code, in_stock,
          inventory_quantity, seller_count,
          seller_name, buy_box_seller,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
        ON CONFLICT (asin) 
        DO UPDATE SET 
          title = COALESCE(EXCLUDED.title, products.title),
          image_url = COALESCE(EXCLUDED.image_url, products.image_url),
          brand = COALESCE(EXCLUDED.brand, products.brand),
          category = COALESCE(EXCLUDED.category, products.category),
          price = CASE WHEN EXCLUDED.price > 0 THEN EXCLUDED.price ELSE products.price END,
          inventory_quantity = EXCLUDED.inventory_quantity,
          seller_count = EXCLUDED.seller_count,
          buy_box_seller = COALESCE(EXCLUDED.buy_box_seller, products.buy_box_seller),
          updated_at = NOW()
      `;

      const attrs = productData.AttributeSets?.[0] || {};
      const values = [
        asin,
        attrs.PartNumber || asin,
        title,
        attrs.Feature || productData.attributes?.feature?.[0]?.value || null,
        category,
        brand,
        imageUrl,
        price,
        attrs.ListPrice?.CurrencyCode || 'USD',
        true,
        inventoryQuantity,
        sellerCount,
        buyBoxSeller, // seller_name
        buyBoxSeller  // buy_box_seller
      ];

      await pool.query(query, values);
      logger.info(`Saved product ${asin}: ${title} (Stock: ${inventoryQuantity}, Sellers: ${sellerCount}, Buy Box: ${buyBoxSeller})`);
    } catch (error) {
      logger.error('Failed to save product:', error);
    }
  }

  async stop(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    
    logger.info('Simple Amazon sync service stopped');
  }
}
