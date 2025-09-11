-- Adicionar colunas de controle de imagem na tabela products
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS image_source_url TEXT,
ADD COLUMN IF NOT EXISTS image_key VARCHAR(50),
ADD COLUMN IF NOT EXISTS image_etag VARCHAR(255),
ADD COLUMN IF NOT EXISTS image_last_checked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS marketplace_id VARCHAR(20) DEFAULT 'ATVPDKIKX0DER';

-- Criar índice para busca rápida por ASIN
CREATE INDEX IF NOT EXISTS idx_products_asin ON products(asin);
CREATE INDEX IF NOT EXISTS idx_products_marketplace ON products(marketplace_id);

-- Extrair image_key das URLs existentes
UPDATE products 
SET image_key = 
  CASE 
    WHEN image_url LIKE '%/images/I/%' THEN 
      SUBSTRING(
        SUBSTRING(image_url FROM '/images/I/[^/]+'),
        12,
        POSITION('.' IN SUBSTRING(image_url FROM '/images/I/[^/]+')) - 12
      )
    ELSE NULL
  END
WHERE image_url IS NOT NULL 
  AND image_url != ''
  AND image_key IS NULL;

-- Normalizar image_source_url para URLs completas da Amazon
UPDATE products 
SET image_source_url = image_url
WHERE image_url IS NOT NULL 
  AND image_url LIKE 'https://m.media-amazon.com/%'
  AND image_source_url IS NULL;

-- Para produtos com image_key mas sem image_source_url, gerar URL padrão
UPDATE products 
SET image_source_url = 'https://m.media-amazon.com/images/I/' || image_key || '._SX240_.jpg'
WHERE image_key IS NOT NULL 
  AND image_source_url IS NULL;

-- Marcar última verificação como agora para produtos com imagem
UPDATE products 
SET image_last_checked_at = NOW()
WHERE (image_source_url IS NOT NULL OR image_key IS NOT NULL)
  AND image_last_checked_at IS NULL;