# Amazon Advertising API Setup Guide

## Status Atual

✅ **Credenciais Configuradas:**
- CLIENT_ID: `amzn1.application-oa2-client.18254efcd1ef40ecb7f0e54c979c479f`
- CLIENT_SECRET: `<AMAZON_OAUTH_SECRET>`
- SECURITY_PROFILE_ID: `amzn1.application.71b8e1ef75a945c8bfb1f5b4b6873841`
- PROFILE_ID: `2984328847900411`
- REDIRECT_URI: `https://appproft.com/signin`

❌ **Pendente:**
- ACCESS_TOKEN: Precisa do fluxo OAuth
- REFRESH_TOKEN: Precisa do fluxo OAuth

## Como Obter os Tokens OAuth

### Opção 1: Via Script Automatizado

1. Execute o script de autorização:
```bash
node get-amazon-ads-token.js
```

2. O navegador abrirá automaticamente. Se não abrir, acesse:
```
https://www.amazon.com/ap/oa?client_id=amzn1.application-oa2-client.18254efcd1ef40ecb7f0e54c979c479f&scope=advertising::campaign_management&response_type=code&redirect_uri=https%3A%2F%2Fappproft.com%2Fsignin
```

3. Faça login na sua conta Amazon Seller/Advertising

4. Autorize o aplicativo

5. Você será redirecionado para: `https://appproft.com/signin?code=AUTHORIZATION_CODE`

6. Copie o valor de `code` da URL

7. Cole no terminal quando solicitado

8. O script mostrará os tokens. Atualize o arquivo `.env`:
```env
AMAZON_ADS_ACCESS_TOKEN=Atza|...
AMAZON_ADS_REFRESH_TOKEN=Atzr|...
```

### Opção 2: Via Postman/Manual

1. **Obter Authorization Code:**
   - GET: `https://www.amazon.com/ap/oa`
   - Parâmetros:
     - client_id: `amzn1.application-oa2-client.18254efcd1ef40ecb7f0e54c979c479f`
     - scope: `advertising::campaign_management`
     - response_type: `code`
     - redirect_uri: `https://appproft.com/signin`

2. **Trocar Code por Tokens:**
   - POST: `https://api.amazon.com/auth/o2/token`
   - Headers:
     - Content-Type: `application/x-www-form-urlencoded`
   - Body:
     - grant_type: `authorization_code`
     - code: `[AUTHORIZATION_CODE]`
     - client_id: `amzn1.application-oa2-client.18254efcd1ef40ecb7f0e54c979c479f`
     - client_secret: `<AMAZON_OAUTH_SECRET>`
     - redirect_uri: `https://appproft.com/signin`

3. **Resposta esperada:**
```json
{
  "access_token": "Atza|...",
  "refresh_token": "Atzr|...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

## Após Obter os Tokens

1. Atualize o arquivo `.env` com os tokens

2. Reinicie o scheduler:
```bash
# Pare o scheduler atual (Ctrl+C)
# Reinicie
node sync-acos-scheduler.js
```

3. O sistema começará a sincronizar dados reais de ACOS

## Sistema em Modo Teste

Enquanto os tokens não são configurados, o sistema funciona em **modo teste**:
- Gera dados ACOS simulados (0-50%)
- Atualiza a cada 6 horas
- Dashboard exibe os dados normalmente

## Troubleshooting

### Erro 404
- Verifique se os tokens estão válidos
- Confirme o Profile ID correto

### Token Expirado
- O refresh token é usado automaticamente
- Se falhar, repita o processo OAuth

### Sem dados de ACOS
- Certifique-se de ter campanhas ativas
- Verifique o período de dados (últimos 30 dias)

## Contato

Para dúvidas sobre a integração:
- Documentação: https://advertising.amazon.com/API/docs
- Console: https://advertising.amazon.com