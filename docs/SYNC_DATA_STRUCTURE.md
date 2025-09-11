# Estrutura de Dados - Sincronização Amazon SP-API

## Dados Salvos Durante a Sincronização Inicial

A sincronização inicial de 12 meses salvará os seguintes dados no PostgreSQL:

## 1. Tabela: `orders` (Pedidos)

### Dados Principais do Pedido:
| Campo | Tipo | Descrição | Exemplo |
|-------|------|-----------|---------|
| `amazon_order_id` | VARCHAR | ID único do pedido na Amazon | "111-7654321-1234567" |
| `seller_id` | VARCHAR | ID do vendedor | "<AMAZON_SELLER_ID>" |
| `marketplace_id` | VARCHAR | ID do marketplace | "ATVPDKIKX0DER" (US) |
| `purchase_date` | TIMESTAMP | Data/hora da compra | "2024-01-15 14:30:00" |
| `last_update_date` | TIMESTAMP | Última atualização | "2024-01-16 10:00:00" |
| `order_status` | VARCHAR | Status na Amazon | "Shipped", "Pending", "Canceled" |
| `status` | VARCHAR | Status simplificado | "shipped", "pending", "cancelled" |

### Dados Financeiros:
| Campo | Tipo | Descrição | Exemplo |
|-------|------|-----------|---------|
| `currency_code` | VARCHAR | Moeda | "USD", "BRL" |
| `order_total` | DECIMAL | Valor total do pedido | 149.99 |
| `amount` | DECIMAL | Valor do pedido | 149.99 |
| `shipping_price` | DECIMAL | Valor do frete | 10.00 |

### Dados do Cliente:
| Campo | Tipo | Descrição | Exemplo |
|-------|------|-----------|---------|
| `buyer_email` | VARCHAR | Email do comprador | "cliente@email.com" |
| `buyer_name` | VARCHAR | Nome do comprador | "João Silva" |

### Dados de Entrega:
| Campo | Tipo | Descrição | Exemplo |
|-------|------|-----------|---------|
| `ship_city` | VARCHAR | Cidade de entrega | "São Paulo" |
| `ship_state` | VARCHAR | Estado | "SP" |
| `ship_postal_code` | VARCHAR | CEP | "01310-100" |
| `ship_country` | VARCHAR | País | "BR" |
| `ship_service_level` | VARCHAR | Tipo de entrega | "Standard", "Expedited" |

### Dados de Canal e Fulfillment:
| Campo | Tipo | Descrição | Exemplo |
|-------|------|-----------|---------|
| `fulfillment_channel` | VARCHAR | Canal de fulfillment | "AFN" (Amazon), "MFN" (Merchant) |
| `sales_channel` | VARCHAR | Canal de venda | "Amazon.com" |
| `payment_method` | VARCHAR | Método de pagamento | "CreditCard", "Other" |

### Flags e Indicadores:
| Campo | Tipo | Descrição | Exemplo |
|-------|------|-----------|---------|
| `is_business_order` | BOOLEAN | É pedido B2B? | false |
| `is_prime` | BOOLEAN | É pedido Prime? | true |
| `is_premium_order` | BOOLEAN | É pedido Premium? | false |
| `is_replacement_order` | BOOLEAN | É reposição? | false |

### Dados Técnicos:
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `raw_data` | JSONB | JSON completo da Amazon com todos os dados |
| `created_at` | TIMESTAMP | Data de criação no banco |
| `updated_at` | TIMESTAMP | Data de atualização no banco |

## 2. Tabela: `order_items` (Itens dos Pedidos)

### Identificação:
| Campo | Tipo | Descrição | Exemplo |
|-------|------|-----------|---------|
| `order_id` | INTEGER | ID do pedido (FK) | 1234 |
| `amazon_order_id` | VARCHAR | ID Amazon do pedido | "111-7654321-1234567" |
| `order_item_id` | VARCHAR | ID único do item | "12345678901234" |

### Dados do Produto:
| Campo | Tipo | Descrição | Exemplo |
|-------|------|-----------|---------|
| `asin` | VARCHAR | ASIN do produto | "B08N5WRWNW" |
| `sku` | VARCHAR | SKU do vendedor | "ECHO-DOT-4" |
| `title` | VARCHAR | Nome do produto | "Echo Dot (4th Gen)" |

### Quantidades:
| Campo | Tipo | Descrição | Exemplo |
|-------|------|-----------|---------|
| `quantity_ordered` | INTEGER | Quantidade pedida | 2 |
| `quantity_shipped` | INTEGER | Quantidade enviada | 2 |

### Valores Financeiros:
| Campo | Tipo | Descrição | Exemplo |
|-------|------|-----------|---------|
| `currency_code` | VARCHAR | Moeda | "USD" |
| `item_price` | DECIMAL | Preço do item | 49.99 |
| `item_tax` | DECIMAL | Imposto do item | 4.50 |
| `shipping_price` | DECIMAL | Frete do item | 5.00 |
| `shipping_tax` | DECIMAL | Imposto do frete | 0.45 |
| `shipping_discount` | DECIMAL | Desconto no frete | 2.00 |
| `promotion_discount` | DECIMAL | Desconto promocional | 10.00 |

### Outros Dados:
| Campo | Tipo | Descrição | Exemplo |
|-------|------|-----------|---------|
| `condition_id` | VARCHAR | Condição do produto | "New", "Used" |
| `is_gift` | BOOLEAN | É presente? | false |

## 3. Tabela: `sync_logs` (Logs de Sincronização)

| Campo | Tipo | Descrição | Exemplo |
|-------|------|-----------|---------|
| `sync_type` | VARCHAR | Tipo de sync | "initial_load", "daily_sync" |
| `period` | VARCHAR | Período sincronizado | "2024-01" |
| `status` | VARCHAR | Status | "completed", "failed" |
| `orders_synced` | INTEGER | Quantidade sincronizada | 145 |
| `started_at` | TIMESTAMP | Início | "2024-01-23 10:00:00" |
| `completed_at` | TIMESTAMP | Fim | "2024-01-23 10:01:10" |
| `metadata` | JSONB | Metadados adicionais | {"ordersCreated": 145} |

## 4. Tabela: `daily_metrics` (Métricas Diárias - Calculadas)

| Campo | Tipo | Descrição | Exemplo |
|-------|------|-----------|---------|
| `date` | DATE | Data | "2024-01-15" |
| `orders_count` | INTEGER | Total de pedidos | 25 |
| `units_sold` | INTEGER | Unidades vendidas | 48 |
| `gross_revenue` | DECIMAL | Receita bruta | 3750.00 |
| `average_order_value` | DECIMAL | Ticket médio | 150.00 |

## Exemplo de Dados Reais

### Pedido Típico:
```json
{
  "amazon_order_id": "111-2345678-9012345",
  "purchase_date": "2024-01-15T14:30:00Z",
  "order_status": "Shipped",
  "order_total": 129.99,
  "buyer_email": "cliente@email.com",
  "ship_city": "New York",
  "ship_state": "NY",
  "is_prime": true,
  "fulfillment_channel": "AFN"
}
```

### Item Típico:
```json
{
  "order_item_id": "12345678901234",
  "asin": "B08N5WRWNW",
  "title": "Echo Dot (4th Gen) - Smart Speaker",
  "quantity_ordered": 1,
  "item_price": 49.99,
  "sku": "ECHO-DOT-4-BLACK"
}
```

## Volume Esperado de Dados

Para uma loja típica na Amazon:

| Período | Pedidos | Itens | Tamanho DB |
|---------|---------|-------|------------|
| 1 mês | 100-500 | 150-750 | ~1 MB |
| 6 meses | 600-3000 | 900-4500 | ~6 MB |
| 12 meses | 1200-6000 | 1800-9000 | ~12 MB |

## Dados NÃO Salvos (Por Segurança)

❌ **Não salvamos**:
- Números de cartão de crédito
- Endereço completo do cliente (apenas cidade/estado)
- Telefone do cliente
- CPF/CNPJ
- Dados bancários

✅ **Salvamos agregados**:
- Email (pode ser anonimizado)
- Nome (primeiro nome apenas)
- Cidade/Estado (sem rua/número)

## Uso dos Dados no Dashboard

Os dados salvos são usados para:

1. **Gráficos de Vendas**: Tendências mensais
2. **Tabela de Produtos**: Produtos mais vendidos
3. **Métricas**: Receita total, ticket médio
4. **Taxa de Entrega**: % de pedidos enviados
5. **Análise Prime**: % de pedidos Prime
6. **Análise Regional**: Vendas por estado/cidade

## Atualização dos Dados

- **Sincronização Inicial**: Carrega 12 meses (1x apenas)
- **Sincronização Diária**: Atualiza últimos 2 dias
- **Conflitos**: `ON CONFLICT` atualiza dados existentes
- **Novos Pedidos**: Inseridos automaticamente
- **Pedidos Cancelados**: Status atualizado