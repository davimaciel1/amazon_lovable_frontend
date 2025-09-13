-- Create table for storing Mercado Livre inventory data
CREATE TABLE IF NOT EXISTS ml_inventory (
  item_id text NOT NULL,
  variation_id text NOT NULL DEFAULT '',
  seller_sku text,
  available_quantity integer NOT NULL DEFAULT 0,
  title text,
  status text,
  site_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, variation_id)
);

-- Create index for faster SKU lookups
CREATE INDEX IF NOT EXISTS idx_ml_inventory_seller_sku ON ml_inventory(seller_sku);

-- Create index for fast status filtering  
CREATE INDEX IF NOT EXISTS idx_ml_inventory_status ON ml_inventory(status);

-- Add comment for documentation
COMMENT ON TABLE ml_inventory IS 'Stores current inventory data from Mercado Livre API (available_quantity)';