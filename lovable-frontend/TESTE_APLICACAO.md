# 🚀 Teste da Aplicação - Frontend + Backend

## URLs de Acesso

### Frontend
- **URL**: http://localhost:8083
- **Páginas disponíveis**:
  - `/` - Página inicial (Landing page)
  - `/auth` - Login/Registro
  - `/sales` - Dashboard de vendas (requer login)

### Backend API
- **URL**: http://localhost:3333
- **Health Check**: http://localhost:3333/health

## Como Testar

1. **Abra o navegador** em: http://localhost:8083

2. **Teste o fluxo de autenticação**:
   - Clique em "Cadastro" ou vá para http://localhost:8083/auth
   - Crie uma nova conta
   - Faça login com as credenciais criadas

3. **Acesse áreas protegidas**:
   - Após login, acesse http://localhost:8083/sales

## Verificação de Problemas

Se a página estiver em branco, verifique:

1. **Console do navegador** (F12):
   - Procure por erros em vermelho
   - Verifique a aba Network para requisições falhadas

2. **Backend está rodando?**
   ```bash
   curl http://localhost:3333/health
   ```
   Deve retornar: `{"status":"ok","timestamp":"..."}`

3. **Frontend está compilando?**
   - Verifique o terminal do Vite para erros
   - Deve mostrar: "ready in XXX ms"

## Comandos Úteis

### Reiniciar Backend
```bash
cd amazon-api-backend
node server-simple.js
```

### Reiniciar Frontend
```bash
cd lovable-frontend
npm run dev
```

## Status Atual

✅ Backend rodando na porta 3333
✅ Frontend rodando na porta 8083
✅ Banco de dados PostgreSQL conectado
✅ Autenticação JWT funcionando
✅ Rotas protegidas configuradas

## Notas

- O frontend usa React + Vite + TypeScript
- O backend usa Express + PostgreSQL
- Autenticação via JWT tokens
- Os dados de vendas são mockados por enquanto