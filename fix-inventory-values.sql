-- Fix inventory values in products table
-- Remove random mock data and set realistic values based on product type

-- Set all inventory to 0 first (no mock data)
UPDATE products SET inventory_quantity = 0;

-- Set realistic inventory for known products if needed
-- Only update if you have real inventory data from Amazon API
-- For now, leaving at 0 to indicate no real data available

-- Update buy_box_seller if NULL
UPDATE products 
SET buy_box_seller = COALESCE(seller_name, brand, 'Unknown')
WHERE buy_box_seller IS NULL;

-- Update seller_count if 0
UPDATE products
SET seller_count = 1
WHERE seller_count = 0 OR seller_count IS NULL;

-- Show updated inventory values
SELECT 
    asin,
    title,
    inventory_quantity as stock,
    buy_box_seller,
    seller_count
FROM products
ORDER BY asin
LIMIT 20;