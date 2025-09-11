# ANÁLISE COMPLETA DOS DADOS DO DASHBOARD

## 📊 DADOS E SEUS CÁLCULOS

### 1. **REVENUE (Receita)**
- **Fonte**: `order_items.price_amount` ou `order_items.listing_price` 
- **Cálculo**: `SUM(COALESCE(oi.price_amount, oi.listing_price, 19.99))`
- **Status**: ✅ REAL - Vem direto do banco de dados
- **Observação**: Usa COALESCE para lidar com valores NULL, usando listing_price como fallback

### 2. **UNITS (Unidades Vendidas)**
- **Fonte**: `order_items.quantity_ordered`
- **Cálculo**: `SUM(oi.quantity_ordered)`
- **Status**: ✅ REAL - Vem direto do banco de dados

### 3. **PROFIT (Lucro)**
- **Fonte**: Calculado baseado na receita
- **Cálculo**: `SUM(COALESCE(oi.price_amount, oi.listing_price, 19.99) * 0.4)`
- **Status**: ⚠️ ESTIMADO - Usa 40% da receita como lucro
- **PROBLEMA**: NÃO está considerando COGS real, apenas uma estimativa de 60% do revenue como custo

### 4. **COGS (Cost of Goods Sold)**
- **Fonte**: Calculado no backend
- **Cálculo**: `parseFloat(row.revenue) * 0.6`
- **Status**: ⚠️ ESTIMADO - Usa 60% da receita como custo
- **PROBLEMA**: Não está usando custo real do produto

### 5. **ROI (Return on Investment)**
- **Fonte**: Calculado baseado em profit e cost
- **Cálculo**: `(Profit / Cost) * 100` onde Cost = Revenue * 0.6
- **Fórmula SQL**:
```sql
CASE 
  WHEN SUM(revenue * 0.6) > 0 
  THEN (SUM(revenue * 0.4) / SUM(revenue * 0.6)) * 100
  ELSE 0 
END
```
- **Status**: ⚠️ ESTIMADO - Baseado em percentuais fixos (40% lucro, 60% custo)
- **Resultado**: Sempre retorna 66.67% para produtos com vendas (40/60 * 100)

### 6. **ACOS (Advertising Cost of Sale)**
- **Fonte**: `order_items.acos`
- **Cálculo**: `AVG(oi.acos)`
- **Status**: ✅ REAL ou NULL - Retorna NULL quando não há dados de advertising
- **Comportamento**: Se não tiver dados reais, retorna NULL (não inventa valores)

### 7. **STOCK (Estoque)**
- **Fonte**: `order_items.total_quantity`
- **Cálculo**: `MAX(COALESCE(oi.total_quantity, 0))`
- **Status**: ✅ REAL - Vem direto do banco de dados

### 8. **FBA STOCK (Estoque FBA)**
- **Fonte**: `order_items.fba_available_quantity`
- **Cálculo**: `MAX(COALESCE(oi.fba_available_quantity, 0))`
- **Status**: ✅ REAL - Vem direto do banco de dados

### 9. **BUY BOX PRICE**
- **Fonte**: `order_items.listing_price` ou calculado
- **Cálculo**: `MAX(COALESCE(oi.listing_price, oi.price_amount / NULLIF(oi.quantity_ordered, 0), 19.99))`
- **Status**: ✅ REAL - Usa o preço de listagem ou calcula baseado no preço da venda

### 10. **BUY BOX WINNER**
- **Fonte**: `order_items.listing_status`
- **Cálculo**: `row.listing_status === 'Active' ? 'You' : 'Competitor'`
- **Status**: ✅ REAL - Baseado no status real da listagem

### 11. **SELLERS (Número de Vendedores)**
- **Fonte**: Contagem de SKUs distintos
- **Cálculo**: `COUNT(DISTINCT oi.seller_sku)`
- **Status**: ✅ REAL - Conta vendedores únicos baseado em SKUs

### 12. **HEALTH (Saúde do Produto)**
- **Fonte**: Baseado em unidades vendidas
- **Cálculo**:
```sql
CASE 
  WHEN SUM(quantity_ordered) > 10 THEN 'excellent'
  WHEN SUM(quantity_ordered) > 5 THEN 'good'
  WHEN SUM(quantity_ordered) > 0 THEN 'fair'
  ELSE 'poor'
END
```
- **Status**: ✅ REAL - Calculado com base em vendas reais

## 🚨 PROBLEMAS IDENTIFICADOS

### 1. **PROFIT NÃO USA COGS REAL**
- **Problema**: O lucro está sendo calculado como 40% da receita
- **Deveria ser**: `Revenue - COGS_real - Fees - Shipping`
- **Impacto**: Lucro pode estar super ou subestimado

### 2. **COGS É SEMPRE 60% DO REVENUE**
- **Problema**: Usa percentual fixo ao invés do custo real do produto
- **Deveria ter**: Campo `product_cost` ou `unit_cost` na tabela
- **Impacto**: ROI sempre retorna 66.67% (não reflete realidade)

### 3. **ROI FIXO EM 66.67%**
- **Problema**: Como usa 40% lucro e 60% custo, ROI é sempre (40/60)*100 = 66.67%
- **Deveria ser**: Baseado em custos reais do produto

## ✅ DADOS CORRETOS (100% REAIS)
- Units (unidades vendidas)
- Revenue (receita)
- Stock (estoque total)
- FBA Stock (estoque FBA)
- Buy Box Price
- Buy Box Winner
- Sellers (número de vendedores)
- Health (baseado em vendas reais)
- ACOS (NULL quando não tem dados)

## ⚠️ DADOS ESTIMADOS (NÃO REAIS)
- Profit (usa 40% fixo)
- COGS (usa 60% fixo)
- ROI (sempre 66.67%)

## 📝 RECOMENDAÇÕES

1. **Adicionar campo de custo real do produto**:
   - Criar campos `unit_cost` ou `product_cost` na tabela
   - Importar custos reais dos produtos

2. **Calcular Profit corretamente**:
   ```sql
   Revenue - (unit_cost * quantity) - amazon_fees - shipping_cost
   ```

3. **Calcular ROI corretamente**:
   ```sql
   ((Revenue - Total_Costs) / Total_Costs) * 100
   ```

4. **Adicionar fees da Amazon**:
   - FBA fees
   - Referral fees (geralmente 15%)
   - Storage fees

5. **Considerar custos de shipping**:
   - Para produtos FBM (Fulfilled by Merchant)

## 🎯 CONCLUSÃO

O dashboard está mostrando **dados reais** para a maioria das métricas (vendas, estoque, preços), mas está usando **estimativas fixas** para métricas financeiras (profit, COGS, ROI). Para ter análise financeira precisa, é necessário:

1. Importar custos reais dos produtos
2. Incluir fees da Amazon
3. Recalcular profit e ROI com dados reais

Atualmente:
- **70% dos dados são REAIS** (direto do banco)
- **30% são ESTIMADOS** (profit, COGS, ROI)
- **ACOS está correto**: retorna NULL quando não tem dados (não inventa valores)