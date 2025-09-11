-- Atualizar tabela product_cogs para campos em português brasileiro
ALTER TABLE product_cogs 
ADD COLUMN IF NOT EXISTS compra NUMERIC DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS armazenagem NUMERIC DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS frete_amazon NUMERIC DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS imposto NUMERIC DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS margem_contribuicao NUMERIC DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS custo_variavel NUMERIC DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS comissao_amazon NUMERIC DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS logistica_amazon NUMERIC DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS percentual_lucro NUMERIC DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS receita_bruta NUMERIC DEFAULT 0.00;

-- Comentários para documentar os campos
COMMENT ON COLUMN product_cogs.compra IS 'Custo de compra/wholesale do produto';
COMMENT ON COLUMN product_cogs.armazenagem IS 'Custos de armazenagem e inspeção';
COMMENT ON COLUMN product_cogs.frete_amazon IS 'Frete para envio à Amazon (inbound shipping)';
COMMENT ON COLUMN product_cogs.imposto IS 'Impostos de importação e outros';
COMMENT ON COLUMN product_cogs.margem_contribuicao IS 'Margem de contribuição';
COMMENT ON COLUMN product_cogs.custo_variavel IS 'Custos variáveis totais';
COMMENT ON COLUMN product_cogs.comissao_amazon IS 'Comissão da Amazon (calculado automaticamente)';
COMMENT ON COLUMN product_cogs.logistica_amazon IS 'Custos de logística da Amazon (calculado automaticamente)';
COMMENT ON COLUMN product_cogs.percentual_lucro IS 'Percentual de lucro calculado';
COMMENT ON COLUMN product_cogs.receita_bruta IS 'Receita bruta do produto';

-- Função para calcular automaticamente os valores derivados
CREATE OR REPLACE FUNCTION calculate_cogs_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Calcular custo variável total (soma dos custos manuais)
  NEW.custo_variavel = COALESCE(NEW.compra, 0) + 
                       COALESCE(NEW.armazenagem, 0) + 
                       COALESCE(NEW.frete_amazon, 0) + 
                       COALESCE(NEW.imposto, 0);
  
  -- Calcular comissão Amazon (15% da receita bruta como padrão)
  NEW.comissao_amazon = COALESCE(NEW.receita_bruta, 0) * 0.15;
  
  -- Calcular logística Amazon (R$ 8.00 como padrão)
  NEW.logistica_amazon = 8.00;
  
  -- Calcular COGS total
  NEW.total_cogs = NEW.custo_variavel + NEW.comissao_amazon + NEW.logistica_amazon;
  
  -- Calcular margem de contribuição
  NEW.margem_contribuicao = COALESCE(NEW.receita_bruta, 0) - NEW.total_cogs;
  
  -- Calcular percentual de lucro
  IF NEW.receita_bruta > 0 THEN
    NEW.percentual_lucro = (NEW.margem_contribuicao / NEW.receita_bruta) * 100;
  ELSE
    NEW.percentual_lucro = 0;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para cálculos automáticos
DROP TRIGGER IF EXISTS trigger_calculate_cogs ON product_cogs;
CREATE TRIGGER trigger_calculate_cogs
  BEFORE INSERT OR UPDATE ON product_cogs
  FOR EACH ROW
  EXECUTE FUNCTION calculate_cogs_fields();