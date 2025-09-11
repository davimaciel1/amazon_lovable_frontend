/**
 * Amazon Data Synchronization Service
 * Fetches data from Amazon SP-API and populates the database
 */

// Import as any to avoid strict typing issues from third-party TS sources
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AmazonSpApi: any = require('amazon-sp-api');
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { tokenRefreshService } from './token-refresh.service';
import { assertImageUpdateAllowed } from '../utils/consistency';
import { imageAudit } from './image-audit.service';

export class AmazonSyncService {
  private sp: any;
  private tokenService = tokenRefreshService;
  private syncInterval: NodeJS.Timeout | null = null;

  constructor() {
    try {
      this.sp = new AmazonSpApi({
        region: (process.env.SP_API_REGION || 'na') as 'na' | 'eu' | 'fe',
        // Pass-through credentials as provided; wrapped client handles details
        credentials: {
          app_client_id: process.env.SP_API_APP_CLIENT_ID,
          app_client_secret: process.env.SP_API_APP_CLIENT_SECRET,
          access_key_id: process.env.SP_API_ACCESS_KEY_ID,
          secret_access_key: process.env.SP_API_SECRET_ACCESS_KEY,
          role_arn: process.env.SP_API_ROLE_ARN
        },
        options: {
          auto_request_tokens: false,
          use_sandbox: false
        }
      });
    } catch (e) {
      logger.warn('Amazon SP-API client not initialized; continuing with limited functionality');
      this.sp = null;
    }
  }

  async initialize(): Promise<void> {
    try {
      // Token refresh service starts on import in current implementation

      // Start data synchronization
      await this.syncAll();

      // Schedule periodic sync every 30 minutes
      this.syncInterval = setInterval(() => {
        this.syncAll().catch(error => {
          logger.error('Scheduled sync failed:', error);
        });
      }, 30 * 60 * 1000);

      logger.info('Amazon sync service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Amazon sync service:', error);
      throw error;
    }
  }

  async syncAll(): Promise<void> {
    logger.info('Starting full Amazon data sync...');
    
    try {
      // Get fresh access token if available
      const accessToken = await this.tokenService.getSPAPIToken();
      if (accessToken) {
        this.sp.accessToken = accessToken;
      }

      // Sync different data types
      await Promise.allSettled([
        this.syncOrders(),
        this.syncProducts(),
        this.syncInventory()
      ]);

      logger.info('Full Amazon data sync completed');
    } catch (error) {
      logger.error('Full sync failed:', error);
      throw error;
    }
  }

  async syncOrders(): Promise<void> {
    try {
      logger.info('Syncing orders from Amazon...');

      // Get orders from last 30 days
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      const ordersResponse = await this.sp.callAPI({
        operation: 'getOrders',
        path: '/orders/v0/orders',
        query: {
          CreatedAfter: startDate.toISOString(),
          CreatedBefore: endDate.toISOString(),
          MarketplaceIds: process.env.SP_API_MARKETPLACE_IDS?.split(',') || ['ATVPDKIKX0DER']
        }
      });

      if (ordersResponse.Orders && ordersResponse.Orders.length > 0) {
        for (const order of ordersResponse.Orders) {
          await this.saveOrder(order);
          
          // Get order items
          await this.syncOrderItems(order.AmazonOrderId);
        }
        
        logger.info(`Synced ${ordersResponse.Orders.length} orders`);
      }
    } catch (error) {
      logger.error('Order sync failed:', error);
    }
  }

  async syncOrderItems(orderId: string): Promise<void> {
    try {
      const itemsResponse = await this.sp.callAPI({
        operation: 'getOrderItems',
        path: `/orders/v0/orders/${orderId}/orderItems`
      });

      if (itemsResponse.OrderItems && itemsResponse.OrderItems.length > 0) {
        for (const item of itemsResponse.OrderItems) {
          await this.saveOrderItem(orderId, item);
        }
      }
    } catch (error) {
      logger.error(`Failed to sync items for order ${orderId}:`, error);
    }
  }

  async syncProducts(): Promise<void> {
    try {
      logger.info('Syncing products from Amazon...');

      // Get catalog items
      const catalogResponse = await this.sp.callAPI({
        operation: 'searchCatalogItems',
        path: '/catalog/2022-04-01/items',
        query: {
          marketplaceIds: process.env.SP_API_MARKETPLACE_IDS?.split(',') || ['ATVPDKIKX0DER'],
          sellerId: process.env.SP_API_SELLER_ID
        }
      });

      if (catalogResponse.items && catalogResponse.items.length > 0) {
        for (const item of catalogResponse.items) {
          await this.saveProduct(item);
        }
        
        logger.info(`Synced ${catalogResponse.items.length} products`);
      }
    } catch (error) {
      logger.error('Product sync failed:', error);
    }
  }

  async syncInventory(): Promise<void> {
    try {
      logger.info('Syncing inventory from Amazon...');

      const inventoryResponse = await this.sp.callAPI({
        operation: 'getInventorySummaries',
        path: '/fba/inventory/v1/summaries',
        query: {
          marketplaceIds: process.env.SP_API_MARKETPLACE_IDS?.split(',') || ['ATVPDKIKX0DER']
        }
      });

      if (inventoryResponse.inventorySummaries && inventoryResponse.inventorySummaries.length > 0) {
        for (const summary of inventoryResponse.inventorySummaries) {
          await this.updateProductInventory(summary);
        }
        
        logger.info(`Updated inventory for ${inventoryResponse.inventorySummaries.length} products`);
      }
    } catch (error) {
      logger.error('Inventory sync failed:', error);
    }
  }

  private async saveOrder(orderData: any): Promise<void> {
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
  }

  private async saveOrderItem(orderId: string, itemData: any): Promise<void> {
    const query = `
      INSERT INTO order_items (
        amazon_order_id, order_item_id, asin,
        seller_sku, title, quantity_ordered,
        quantity_shipped, item_price, item_tax,
        promotion_discount, is_gift,
        condition_id, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      ON CONFLICT (order_item_id) 
      DO UPDATE SET 
        quantity_shipped = EXCLUDED.quantity_shipped,
        updated_at = NOW()
    `;

    const values = [
      orderId,
      itemData.OrderItemId,
      itemData.ASIN,
      itemData.SellerSKU,
      itemData.Title,
      itemData.QuantityOrdered || 0,
      itemData.QuantityShipped || 0,
      itemData.ItemPrice?.Amount || 0,
      itemData.ItemTax?.Amount || 0,
      itemData.PromotionDiscount?.Amount || 0,
      itemData.IsGift || false,
      itemData.ConditionId || 'New'
    ];

    await pool.query(query, values);
  }

  private async saveProduct(productData: any): Promise<void> {
    // Extract image URL from product data
    const incomingImageUrl = productData.images?.find((img: any) => img.variant === 'MAIN')?.link || 
                    productData.images?.[0]?.link || null;

    // Check current values for audit and conditional update
    const { rows } = await pool.query('SELECT image_url, local_image_url FROM products WHERE asin = $1', [productData.asin]);
    const current = rows[0] || { image_url: null, local_image_url: null };

    const allowImageUpdate = assertImageUpdateAllowed('amazon-sync.saveProduct', productData.asin);

    if (!allowImageUpdate && incomingImageUrl && incomingImageUrl !== current.image_url) {
      await imageAudit.record({
        asin: productData.asin,
        old_image_url: current.image_url,
        new_image_url: incomingImageUrl,
        old_local_image_url: current.local_image_url,
        new_local_image_url: current.local_image_url,
        was_blocked: true,
        reason: 'CONSISTENCY_LOCK',
        actor: 'system',
        source: 'amazon-sync.saveProduct'
      });
    }

    // Build conditional upsert
    const query = allowImageUpdate ? `
      INSERT INTO products (
        asin, sku, title, description,
        category, brand, image_url,
        price, currency_code, in_stock,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (asin) 
      DO UPDATE SET 
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        image_url = EXCLUDED.image_url,
        price = EXCLUDED.price,
        in_stock = EXCLUDED.in_stock,
        updated_at = NOW()
    ` : `
      INSERT INTO products (
        asin, sku, title, description,
        category, brand, price, currency_code, in_stock,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (asin) 
      DO UPDATE SET 
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        price = EXCLUDED.price,
        in_stock = EXCLUDED.in_stock,
        updated_at = NOW()
    `;

    const values = allowImageUpdate ? [
      productData.asin,
      productData.identifiers?.find((id: any) => id.identifierType === 'SKU')?.identifier || productData.asin,
      productData.summaries?.[0]?.itemName || productData.title || 'Unknown Product',
      productData.summaries?.[0]?.manufacturer || productData.description || null,
      productData.salesRanks?.[0]?.displayGroupRanks?.[0]?.title || 'General',
      productData.summaries?.[0]?.brand || productData.brand || null,
      incomingImageUrl,
      productData.summaries?.[0]?.price?.value || 0,
      productData.summaries?.[0]?.price?.currency || 'USD',
      true,
    ] : [
      productData.asin,
      productData.identifiers?.find((id: any) => id.identifierType === 'SKU')?.identifier || productData.asin,
      productData.summaries?.[0]?.itemName || productData.title || 'Unknown Product',
      productData.summaries?.[0]?.manufacturer || productData.description || null,
      productData.salesRanks?.[0]?.displayGroupRanks?.[0]?.title || 'General',
      productData.summaries?.[0]?.brand || productData.brand || null,
      // image_url intentionally omitted
      productData.summaries?.[0]?.price?.value || 0,
      productData.summaries?.[0]?.price?.currency || 'USD',
      true,
    ];

    await pool.query(query, values);

    if (allowImageUpdate && incomingImageUrl && incomingImageUrl !== current.image_url) {
      await imageAudit.record({
        asin: productData.asin,
        old_image_url: current.image_url,
        new_image_url: incomingImageUrl,
        old_local_image_url: current.local_image_url,
        new_local_image_url: current.local_image_url,
        was_blocked: false,
        reason: 'SYNC_PRODUCT',
        actor: 'system',
        source: 'amazon-sync.saveProduct'
      });
    }
  }

  private async updateProductInventory(inventoryData: any): Promise<void> {
    const query = `
      UPDATE products 
      SET 
        inventory_quantity = $1,
        in_stock = $2,
        updated_at = NOW()
      WHERE asin = $3 OR sku = $3
    `;

    const totalQuantity = 
      (inventoryData.inventoryDetails?.fulfillableQuantity || 0) +
      (inventoryData.inventoryDetails?.unfulfillableQuantity || 0);

    const values = [
      totalQuantity,
      totalQuantity > 0,
      inventoryData.asin || inventoryData.sellerSku
    ];

    await pool.query(query, values);
  }

  async stop(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    
    this.tokenService.stopAutoRefresh();
    logger.info('Amazon sync service stopped');
  }
}