-- Mercado Livre Orders Schema
-- Safe to run multiple times; uses IF NOT EXISTS

BEGIN;

-- Credentials table for Mercado Livre OAuth and API usage
CREATE TABLE IF NOT EXISTS ml_credentials (
  id               bigserial PRIMARY KEY,
  credential_key   text NOT NULL,
  credential_value text NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (credential_key)
);

-- Core orders table
CREATE TABLE IF NOT EXISTS ml_orders (
  id                         bigserial PRIMARY KEY,
  ml_order_id                bigint NOT NULL,
  seller_id                  bigint,
  buyer_id                   bigint,
  pack_id                    bigint,
  pickup_id                  bigint,
  shipping_id                bigint,
  site_id                    text,             -- e.g., MLB
  channel                    text,             -- context.channel (marketplace, mshops, etc.)
  status                     text,             -- paid, cancelled, etc.
  status_detail              text,
  total_amount               numeric(18,4),
  paid_amount                numeric(18,4),
  coupon_amount              numeric(18,4),
  currency_id                text,             -- BRL, etc.
  taxes_amount               numeric(18,4),
  date_created               timestamptz,
  date_closed                timestamptz,
  last_updated               timestamptz,
  tags                       text[] DEFAULT '{}',
  fraud_risk_detected        boolean GENERATED ALWAYS AS (CASE WHEN tags @> ARRAY['fraud_risk_detected']::text[] THEN true ELSE false END) STORED,
  raw                        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ml_order_id)
);

-- Order items table
CREATE TABLE IF NOT EXISTS ml_order_items (
  id                   bigserial PRIMARY KEY,
  ml_order_id          bigint NOT NULL REFERENCES ml_orders(ml_order_id) ON DELETE CASCADE,
  item_id              text,              -- e.g., MLB2608564035
  title                text,
  category_id          text,
  variation_id         bigint,
  seller_sku           text,
  quantity             int,
  unit_price           numeric(18,4),
  full_unit_price      numeric(18,4),
  currency_id          text,
  sale_fee             numeric(18,4),
  listing_type_id      text,
  variation_attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw                  jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_ml_orders_order_id ON ml_orders(ml_order_id);
CREATE INDEX IF NOT EXISTS idx_ml_orders_dates ON ml_orders(date_created, date_closed);
CREATE INDEX IF NOT EXISTS idx_ml_orders_status ON ml_orders(status);
CREATE INDEX IF NOT EXISTS idx_ml_orders_seller ON ml_orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_ml_order_items_order ON ml_order_items(ml_order_id);
CREATE INDEX IF NOT EXISTS idx_ml_order_items_sku ON ml_order_items(seller_sku);

COMMIT;
