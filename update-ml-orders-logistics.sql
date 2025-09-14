-- Add logistic fields to ml_orders table
-- Safe to run multiple times

BEGIN;

-- Add logistic_type and logistic_mode columns if they don't exist
ALTER TABLE ml_orders 
ADD COLUMN IF NOT EXISTS logistic_type text,
ADD COLUMN IF NOT EXISTS logistic_mode text;

-- Add index for better performance on fulfillment queries
CREATE INDEX IF NOT EXISTS idx_ml_orders_logistic_type ON ml_orders(logistic_type);

-- Add comment for clarity
COMMENT ON COLUMN ml_orders.logistic_type IS 'Mercado Livre logistic type: fulfillment (FULL), self_service (FLEX), etc';
COMMENT ON COLUMN ml_orders.logistic_mode IS 'Mercado Livre logistic mode details from API';

COMMIT;