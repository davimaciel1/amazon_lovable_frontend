# 📊 CONFIGURAÇÃO DE CUSTOS REAIS - Amazon Dashboard

## 🎯 OBJETIVO

Configurar o sistema para calcular **PROFIT, COGS e ROI com dados REAIS**, não estimativas.

## ⚠️ PROBLEMA ATUAL

Atualmente o sistema está:
- ❌ Usando 60% da receita como COGS (estimativa)
- ❌ Usando 40% da receita como Profit (estimativa)
- ❌ ROI sempre fixo em 66.67% (não real)

## ✅ SOLUÇÃO IMPLEMENTADA

Criamos um sistema completo que:
- ✅ Calcula COGS com todos os custos reais
- ✅ Só mostra Profit quando tem custos reais
- ✅ Só calcula ROI com dados reais
- ✅ Retorna NULL quando não tem dados (não inventa valores)

## 📋 COMPONENTES DE CUSTO INCLUÍDOS

### 1. **Custos do Produto**
- `unit_cost`: Custo unitário do produto (quanto você paga ao fornecedor)

### 2. **Taxas da Amazon**
- `amazon_referral_fee_percent`: Taxa de indicação (geralmente 15%)
- `amazon_fba_fee`: Taxa FBA por unidade
- `amazon_storage_fee_monthly`: Taxa de armazenamento mensal

### 3. **Logística**
- `shipping_cost_to_amazon`: Custo de envio para Amazon por unidade

### 4. **Impostos**
- `tax_percent`: Percentual de impostos (ICMS, PIS, COFINS, etc.)

### 5. **Custos Variáveis**
- `variable_cost_percent`: Custos variáveis (% da receita)
- `packaging_cost`: Custo de embalagem por unidade

### 6. **Marketing e Outros**
- `marketing_cost_monthly`: Investimento em marketing mensal
- `other_fixed_costs`: Outros custos fixos mensais

### 7. **Métricas de Gestão**
- `contribution_margin_percent`: Margem de contribuição desejada

## 🚀 COMO CONFIGURAR

### Passo 1: Executar Scripts SQL

```bash
# 1. Adicionar campos de custo ao banco
psql -h <DB_HOST> -p 5456 -U goku -d dragonball -f database/add_cost_fields.sql

# 2. Inserir custos de exemplo (opcional)
psql -h <DB_HOST> -p 5456 -U goku -d dragonball -f database/insert_sample_costs.sql
```

### Passo 2: Inserir Custos Reais dos Seus Produtos

```sql
-- Para cada produto, insira os custos reais:
INSERT INTO product_costs (
    asin,                           -- ASIN do produto
    sku,                           -- SKU do produto
    unit_cost,                     -- Quanto você paga pelo produto
    amazon_referral_fee_percent,  -- Taxa da Amazon (15%)
    amazon_fba_fee,               -- FBA fee por unidade
    amazon_storage_fee_monthly,   -- Storage mensal total
    shipping_cost_to_amazon,      -- Frete para Amazon
    tax_percent,                  -- Impostos totais
    variable_cost_percent,        -- Custos variáveis
    packaging_cost,               -- Embalagem
    marketing_cost_monthly,       -- Marketing mensal
    other_fixed_costs            -- Outros custos fixos
) VALUES (
    'SEU_ASIN_AQUI',
    'SEU_SKU_AQUI',
    50.00,    -- Exemplo: produto custa R$ 50
    15.00,    -- Amazon cobra 15%
    5.00,     -- FBA fee R$ 5
    30.00,    -- Storage R$ 30/mês
    3.00,     -- Frete R$ 3
    10.00,    -- Impostos 10%
    5.00,     -- Custos variáveis 5%
    1.00,     -- Embalagem R$ 1
    1000.00,  -- Marketing R$ 1000/mês
    500.00    -- Outros R$ 500/mês
);
```

### Passo 3: Usar o Novo Servidor

```bash
# Parar servidor antigo
# Ctrl+C no terminal do server-full-data.js

# Iniciar novo servidor com custos reais
cd amazon-api-backend
node server-real-costs.js
```

## 📊 FÓRMULAS DE CÁLCULO

### COGS (Cost of Goods Sold)
```
COGS = unit_cost × quantity +
       (revenue × amazon_referral_fee_percent / 100) +
       amazon_fba_fee × quantity +
       (amazon_storage_fee_monthly / 30) × quantity +
       shipping_cost_to_amazon × quantity +
       (revenue × tax_percent / 100) +
       (revenue × variable_cost_percent / 100) +
       packaging_cost × quantity +
       (marketing_cost_monthly / 30) × quantity +
       (other_fixed_costs / 30) × quantity
```

### PROFIT (Lucro Real)
```
PROFIT = Revenue - COGS
```
**Nota**: Só calculado quando existem custos reais

### ROI (Return on Investment)
```
ROI = (Profit / COGS) × 100
```
**Nota**: Só calculado quando existem custos reais

### Margem de Contribuição
```
Contribution Margin = ((Revenue - Variable Costs) / Revenue) × 100
```

## 🔍 VERIFICAÇÃO

### Consultar Produtos com Custos Configurados
```sql
SELECT 
    asin,
    sku,
    unit_cost,
    amazon_referral_fee_percent,
    amazon_fba_fee,
    last_updated
FROM product_costs
ORDER BY last_updated DESC;
```

### Ver Lucratividade Real
```sql
SELECT 
    asin,
    title,
    total_units as "Unidades Vendidas",
    total_revenue as "Receita Total",
    total_cogs as "Custo Total (COGS)",
    total_profit as "Lucro Real",
    roi_percent as "ROI %",
    contribution_margin_percent as "Margem Contribuição %"
FROM product_profitability
WHERE total_profit IS NOT NULL
ORDER BY total_profit DESC;
```

## 📈 BENEFÍCIOS

1. **Precisão Financeira**: Lucro e ROI reais, não estimativas
2. **Tomada de Decisão**: Baseada em dados reais
3. **Identificação de Problemas**: Produtos com margem negativa
4. **Otimização**: Saber onde cortar custos
5. **Transparência**: NULL quando não tem dados (não inventa)

## 🎯 PRÓXIMOS PASSOS

1. **Importar custos reais** de todos os produtos
2. **Integrar com SP-API** para buscar fees automaticamente
3. **Criar dashboard de custos** para facilitar inserção
4. **Adicionar histórico** de custos para análise temporal
5. **Alertas automáticos** para produtos com margem baixa

## 📝 NOTAS IMPORTANTES

- **Sem custos = Sem cálculo**: O sistema só calcula profit e ROI quando tem custos reais
- **NULL é melhor que fake**: Preferimos mostrar NULL do que valores inventados
- **Custos mensais**: São divididos por 30 para cálculo diário
- **Atualização regular**: Mantenha os custos atualizados mensalmente

## 🆘 TROUBLESHOOTING

### Dashboard mostra NULL para Profit/ROI
- **Causa**: Produto não tem custos configurados
- **Solução**: Inserir custos na tabela `product_costs`

### ROI muito alto ou baixo
- **Causa**: Custos incorretos ou incompletos
- **Solução**: Revisar todos os componentes de custo

### Erro ao executar SQL
- **Causa**: Tabelas não existem
- **Solução**: Executar `add_cost_fields.sql` primeiro

## 📞 SUPORTE

Para dúvidas ou problemas:
1. Verifique os logs do servidor
2. Consulte a view `product_profitability`
3. Confirme que os custos estão na tabela `product_costs`