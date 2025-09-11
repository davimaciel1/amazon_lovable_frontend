# Configuração Amazon SP-API (Selling Partner API)

## Pré-requisitos

1. **Conta de Vendedor Amazon** (Seller Central)
2. **Conta AWS** para credenciais IAM
3. **Aplicação SP-API aprovada**

## Passo 1: Registrar Aplicação na Amazon

1. Acesse [Seller Central](https://sellercentral.amazon.com.br)
2. Vá para **Apps & Services** > **Develop Apps**
3. Clique em **Add new app client**
4. Preencha os dados:
   - **App name**: N8N Integration
   - **API Type**: SP-API
   - **Roles**: Selecione as permissões necessárias:
     - Orders: View & Manage
     - Inventory: View
     - Reports: View & Create
     - Catalog Items: View

## Passo 2: Configurar IAM na AWS

1. Acesse [AWS Console](https://console.aws.amazon.com)
2. Vá para **IAM** > **Users**
3. Crie um novo usuário: `amazon-sp-api-user`
4. Adicione política inline:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "execute-api:Invoke",
      "Resource": "arn:aws:execute-api:*:*:*"
    }
  ]
}
```

5. Crie chaves de acesso (Access Key ID e Secret Access Key)

## Passo 3: Obter Credenciais SP-API

Após aprovação da aplicação, você receberá:

- **Client ID** (LWA Client ID)
- **Client Secret** (LWA Client Secret)
- **Refresh Token** (após autorização)

### Para obter o Refresh Token:

1. Construa URL de autorização:
```
https://sellercentral.amazon.com.br/apps/authorize/consent?
application_id=YOUR_APP_ID&
state=xyz&
version=beta
```

2. Autorize a aplicação
3. Capture o código de autorização
4. Troque por Refresh Token:

```bash
curl -X POST https://api.amazon.com/auth/o2/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=YOUR_AUTH_CODE" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET"
```

## Passo 4: Configurar no n8n

### Criar Credencial Amazon SP-API

1. No n8n, vá para **Credentials** > **New**
2. Procure por **HTTP Request (OAuth2)**
3. Configure:

```yaml
Authentication: OAuth2
Grant Type: Client Credentials
Access Token URL: https://api.amazon.com/auth/o2/token
Client ID: [Seu LWA Client ID]
Client Secret: [Seu LWA Client Secret]
Scope: 
Authentication: Body
```

### Adicionar Headers Customizados

Para cada requisição, adicione:

```yaml
x-amz-access-token: {{accessToken}}
x-amz-date: {{timestamp}}
x-amz-security-token: {{sessionToken}} (se usando STS)
```

## Passo 5: Configurar Banco de Dados PostgreSQL

### Conexão Local
```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=amazon_orders
POSTGRES_USER=postgres
POSTGRES_PASSWORD=sua_senha
```

### Conexão Supabase (Recomendado)
```env
POSTGRES_HOST=db.xxxxxxxxxxxx.supabase.co
POSTGRES_PORT=5432
POSTGRES_DB=postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=sua_senha_supabase
```

### Executar Schema
```bash
psql -h localhost -U postgres -d amazon_orders -f database/schema.sql
psql -h localhost -U postgres -d amazon_orders -f database/seed-data.sql
```

## Passo 6: Importar Workflows no n8n

1. Acesse n8n: https://n8n.appproft.com
2. Vá para **Workflows** > **Import**
3. Importe os arquivos:
   - `n8n-workflows/amazon-sync-workflow.json`
   - `n8n-workflows/dashboard-api-fixed.json`

## Passo 7: Configurar Credenciais no n8n

### PostgreSQL
1. **Credentials** > **New** > **PostgreSQL**
2. Configure com os dados do seu banco

### Amazon SP-API
1. **Credentials** > **New** > **HTTP Request (OAuth2)**
2. Configure com as credenciais obtidas

## Passo 8: Ativar Workflows

1. Abra o workflow **Amazon SP-API Order Sync**
2. Configure o Schedule Trigger (sugestão: a cada hora)
3. Ative o workflow
4. Teste manualmente primeiro

## Endpoints da API

### Orders
- **List Orders**: `GET /orders/v0/orders`
- **Get Order**: `GET /orders/v0/orders/{orderId}`
- **Get Order Items**: `GET /orders/v0/orders/{orderId}/orderItems`

### Parâmetros Importantes
```javascript
{
  MarketplaceIds: "<AMAZON_SELLER_ID>", // Amazon.com.br
  CreatedAfter: "2024-01-01T00:00:00Z",
  OrderStatuses: "Unshipped,PartiallyShipped,Shipped",
  MaxResultsPerPage: 100,
  NextToken: "..." // Para paginação
}
```

## Marketplaces IDs
- **Brasil**: <AMAZON_SELLER_ID>
- **USA**: ATVPDKIKX0DER
- **México**: <AMAZON_SELLER_ID>
- **Canadá**: <AMAZON_SELLER_ID>

## Rate Limits

A API tem limites de taxa:
- **Orders API**: 0.0167 requisições/segundo (1 req/minuto)
- **Burst**: 20 requisições

Implemente retry com backoff exponencial:

```javascript
async function callWithRetry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.code === 429 && i < retries - 1) {
        await sleep(Math.pow(2, i) * 1000);
      } else {
        throw error;
      }
    }
  }
}
```

## Troubleshooting

### Erro 403 Forbidden
- Verifique as permissões da aplicação
- Confirme que o Refresh Token está válido

### Erro 429 Too Many Requests
- Implemente rate limiting
- Use exponential backoff

### Erro 401 Unauthorized
- Refresh Token expirado
- Client ID/Secret incorretos

## Links Úteis

- [SP-API Documentation](https://developer-docs.amazon.com/sp-api/)
- [SP-API Sandbox](https://developer-docs.amazon.com/sp-api/docs/the-selling-partner-api-sandbox)
- [Postman Collection](https://github.com/amzn/selling-partner-api-models)
- [SDK Python](https://github.com/python-amazon-sp-api/python-amazon-sp-api)
- [SDK Node.js](https://github.com/amz-tools/amazon-sp-api)