# 📊 ANÁLISE DE CONFORMIDADE - Amazon SP-API

## ✅ CONFORMIDADES ATUAIS

### 1. Autenticação OAuth 2.0 / LWA
```javascript
// CORRETO - Sem AWS SigV4
POST https://api.amazon.com/auth/o2/token
grant_type=refresh_token
```
✅ Implementado corretamente

### 2. Headers SP-API
```javascript
// CORRETO - Usa x-amz-access-token
headers: {
  "x-amz-access-token": "{{ access_token }}"
}
```
✅ Sem Authorization AWS SigV4 (conforme nova diretriz)

### 3. Endpoints e MarketplaceIds
```javascript
// CORRETO para USA
endpoint: https://sellingpartnerapi-na.amazon.com
marketplace_id: ATVPDKIKX0DER
```
✅ Região NA configurada corretamente

### 4. Rate Limiting
- ✅ Wait de 65 segundos entre meses
- ✅ Token renovado a cada iteração
- ✅ Timeout de 30 segundos

## ❌ NÃO CONFORMIDADES

### 1. RDT (Restricted Data Token) - CRÍTICO
**Problema**: Dados PII sendo acessados sem RDT
```javascript
// ATUAL (INCORRETO)
buyer_email: order.BuyerEmail
shipping_address: order.ShippingAddress

// CORRETO seria:
// 1. Gerar RDT antes de acessar PII
POST /tokens/2021-03-01/restrictedDataToken
{
  "restrictedResources": [{
    "method": "GET",
    "path": "/orders/v0/orders",
    "dataElements": ["buyerInfo", "shippingAddress"]
  }]
}

// 2. Usar RDT no header
headers: {
  "x-amz-access-token": "{{ RDT_token }}"  // não o access_token normal
}
```

### 2. Paginação não implementada
**Problema**: Limitado a 100 pedidos por mês
```javascript
// FALTANDO
if (response.payload.NextToken) {
  // Fazer nova requisição com NextToken
}
```

### 3. Segurança PII - CRÍTICO
**Problemas**:
- Salvando PII em texto plano no campo `raw_data`
- Sem política de retenção de 30 dias
- Sem criptografia em repouso

**Solução necessária**:
```sql
-- Adicionar campos de controle
ALTER TABLE orders ADD COLUMN pii_encrypted TEXT;
ALTER TABLE orders ADD COLUMN pii_expiry_date DATE;
ALTER TABLE orders ADD COLUMN is_pii_purged BOOLEAN DEFAULT FALSE;

-- Criar job para purgar PII após 30 dias da entrega
CREATE OR REPLACE FUNCTION purge_old_pii() ...
```

### 4. Error Handling incompleto
**Faltando**:
- Tratamento de HTTP 429 (rate limit)
- Exponential backoff com jitter
- Leitura dos headers x-amzn-RateLimit-*

## 📋 PLANO DE CORREÇÃO

### Prioridade 1 - CRÍTICO (Compliance)
1. **Implementar RDT para PII**
   - Criar node para gerar RDT antes de buscar orders
   - Usar RDT ao invés de access_token para chamadas com PII

2. **Segurança PII**
   - Criptografar campos PII no banco
   - Implementar rotina de purga após 30 dias
   - Não salvar raw_data com PII

### Prioridade 2 - ALTA (Funcionalidade)
3. **Implementar paginação**
   - Loop com NextToken até não haver mais páginas
   - Respeitar rate limits entre páginas

4. **Error handling robusto**
   - Detectar 429 e implementar retry
   - Exponential backoff com jitter
   - Ler headers de rate limit

### Prioridade 3 - MÉDIA (Otimização)
5. **Cache de tokens**
   - Cache access_token por 55 minutos
   - Não cachear RDT (curta duração)

6. **Logs e métricas**
   - Capturar x-amzn-RequestId
   - Métricas de throttling por operação

## 🔒 REQUISITOS DE SEGURANÇA (DPP)

Conforme Amazon Data Protection Policy:

1. **Retenção PII**: Máximo 30 dias após entrega
2. **Criptografia**: AES-128+ para PII em repouso
3. **Acesso**: Mínimo necessário, com auditoria
4. **RDT obrigatório**: Para qualquer acesso a PII
5. **Rotação de secrets**: Client secret a cada 180 dias

## 🚀 PRÓXIMOS PASSOS

1. **Criar workflow v2 com RDT**
2. **Adicionar criptografia PII no banco**
3. **Implementar paginação com NextToken**
4. **Adicionar retry logic para 429**
5. **Criar job de purga PII (30 dias)**

## 📚 REFERÊNCIAS

- [SP-API sem SigV4](https://developer-docs.amazon.com/sp-api/docs/connecting-to-the-sp-api#step-2-add-an-access-token-to-your-request)
- [RDT Documentation](https://developer-docs.amazon.com/sp-api/docs/tokens-api-use-case-guide)
- [Data Protection Policy](https://developer-docs.amazon.com/sp-api/docs/data-protection-policy)
- [Rate Limits Guide](https://developer-docs.amazon.com/sp-api/docs/usage-plans-and-rate-limits)