-- Tabela para armazenar mapeamentos reais SKU -> MLB Code
-- Substitui os códigos MLB inventados por códigos reais do Mercado Livre

CREATE TABLE IF NOT EXISTS ml_real_mappings (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(100) NOT NULL UNIQUE,
  mlb_code VARCHAR(20) NOT NULL,
  title VARCHAR(500),
  price DECIMAL(10,2),
  image_url TEXT,
  permalink VARCHAR(500),
  status VARCHAR(20) DEFAULT 'active',
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_ml_real_mappings_sku ON ml_real_mappings(sku);
CREATE INDEX IF NOT EXISTS idx_ml_real_mappings_mlb ON ml_real_mappings(mlb_code);
CREATE INDEX IF NOT EXISTS idx_ml_real_mappings_status ON ml_real_mappings(status);

-- Comentários para documentação
COMMENT ON TABLE ml_real_mappings IS 'Mapeamentos reais SKU para códigos MLB do Mercado Livre, validados via API';
COMMENT ON COLUMN ml_real_mappings.sku IS 'SKU interno do produto (ex: IPAS01)';
COMMENT ON COLUMN ml_real_mappings.mlb_code IS 'Código MLB real do produto no Mercado Livre (ex: MLB123456789)';
COMMENT ON COLUMN ml_real_mappings.verified_at IS 'Timestamp da última verificação via API do ML';