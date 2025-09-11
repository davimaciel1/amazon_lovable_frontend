# Mercado Livre - Orders Integration

This document describes the DB schema, API endpoints, OAuth setup, and n8n workflow to sync Mercado Livre orders and expose them in the UI (new page: /ml/orders).

## 1) Postgres schema

Run the SQL to create the tables:
- create-ml-orders-tables.sql

Tables created:
- ml_credentials (key/value store for ML credentials and tokens)
- ml_orders (normalized order header + raw JSON)
- ml_order_items (order lines + raw JSON)

Key constraints/indexes:
- UNIQUE (ml_order_id) on ml_orders
- Indexes on status, dates, seller_id, and foreign keys on items

## 2) Field mapping (ML API -> DB)

From GET /orders/:id and /orders/search results:
- id -> ml_orders.ml_order_id (bigint)
- date_created -> ml_orders.date_created (timestamptz)
- date_closed -> ml_orders.date_closed (timestamptz)
- last_updated -> ml_orders.last_updated (timestamptz)
- status -> ml_orders.status (text)
- total_amount -> ml_orders.total_amount (numeric)
- paid_amount -> ml_orders.paid_amount (numeric)
- currency_id -> ml_orders.currency_id (text)
- tags[] -> ml_orders.tags (text[])
- context.channel -> ml_orders.channel (text) when available
- site -> ml_orders.site_id (text)
- seller.id -> ml_orders.seller_id (bigint)
- buyer.id -> ml_orders.buyer_id (bigint)
- shipping.id -> ml_orders.shipping_id (bigint)
- taxes.amount -> ml_orders.taxes_amount (numeric) when available
- Entire payload -> ml_orders.raw (jsonb)

Items (order_items[] entries):
- item.id -> ml_order_items.item_id (text)
- item.title -> ml_order_items.title (text)
- item.category_id -> ml_order_items.category_id (text)
- item.variation_id -> ml_order_items.variation_id (bigint)
- seller_sku -> ml_order_items.seller_sku (text)
- quantity -> ml_order_items.quantity (int)
- unit_price -> ml_order_items.unit_price (numeric)
- full_unit_price -> ml_order_items.full_unit_price (numeric)
- currency_id -> ml_order_items.currency_id (text)
- sale_fee -> ml_order_items.sale_fee (numeric)
- listing_type_id -> ml_order_items.listing_type_id (text)
- item.variation_attributes[] -> ml_order_items.variation_attributes (jsonb)
- Line JSON -> ml_order_items.raw (jsonb)

Note: Additional resources like /orders/:id/product and /orders/:id/discounts can be ingested later into auxiliary tables if needed.

## 3) Backend endpoints

Mounted under /api/ml:
- GET /api/ml/orders
  - Query params: page, limit, startDate, endDate, status, search
  - Returns: { orders: [...], pagination: {...} }
- GET /api/ml/orders/summary
  - Query params: period=7d|30d|90d|all
  - Returns: summary KPIs, status distribution, daily trends
- GET /api/ml/orders/:orderId
  - Returns header + items for a single order

## 4) Frontend page

- New route: /ml/orders (Protected)
- File: lovable-frontend/src/pages/MLOrders.tsx
- Read-only list with filters and pagination.
- IMPORTANT (user rule): No manual inputs beyond the existing cost fields in the app; this page only reads data.

## 5) OAuth setup (Mercado Livre)

Environment variables:
- ML_CLIENT_ID=...
- ML_CLIENT_SECRET=...
- ML_REDIRECT_URI=... (must match your app config in ML)

Routes:
- Start:  GET /api/ml/auth/start (redirects user to ML OAuth)
- Callback: GET /api/ml/auth/callback (configured as Redirect URI)

On callback we persist:
- ML_REFRESH_TOKEN, ML_ACCESS_TOKEN, ML_USER_ID, ML_SELLER_ID (if retrievable), ML_ACCESS_TOKEN_EXPIRES_IN in ml_credentials.

Security notes:
- Never log secrets.
- Access tokens are short-lived; workflows should obtain a fresh access_token using ML_REFRESH_TOKEN.

## 6) n8n workflow

File: workflow-ml-orders-sync.json
- Fetches ML_CLIENT_ID/SECRET/REFRESH_TOKEN and ML_SELLER_ID from ml_credentials
- Exchanges refresh_token -> access_token
- Calls /orders/search?seller=...&order.status=paid
- Upserts headers into ml_orders and lines into ml_order_items

Extend as needed:
- Add date filters (e.g., order.date_created.from/to) to backfill historical data
- Add calls to /orders/:id for full detail when needed
- Add calls to /orders/:id/discounts and /orders/:id/product

## 7) Next steps / backlog
- Add background scheduler similar to Amazon to trigger ML sync (or trigger via n8n cron)
- Add detail page UI (/ml/orders/:id) if needed
- Add shipments integration and total_amount_with_shipping computation when using x-format-new headers
- Currency conversion endpoint when taxes.currency_id != items.currency_id

