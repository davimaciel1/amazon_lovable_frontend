# 🚨 REGRAS IMPORTANTES PARA O FRONTEND - LEIA SEMPRE!

## ⛔ REGRA #1: NUNCA CRIE UM FRONTEND DO ZERO!

### ❌ O QUE NÃO FAZER:
- **NUNCA** criar arquivos HTML/CSS/JS simples para dashboard
- **NUNCA** criar servidores Express apenas para servir HTML
- **NUNCA** implementar um frontend "rápido" ou "simples" do zero
- **NUNCA** usar `dashboard-simple.js`, `dashboard.html` ou similares

### ✅ O QUE FAZER SEMPRE:

1. **USE O FRONTEND PROFISSIONAL DO LOVABLE**
   - Localização: `C:\Ippax Work\Projetos\N8N_Amazon\lovable-frontend`
   - Stack: React + TypeScript + Vite + TailwindCSS + shadcn/ui
   - Porta padrão: 8083 (configurada no vite.config.ts)

2. **SE PRECISAR DE NOVO DASHBOARD OU FUNCIONALIDADE:**
   - Peça ao usuário: "Por favor, crie esta interface no Lovable e me envie via GitHub"
   - Aguarde o código do Lovable antes de prosseguir
   - Integre o código do Lovable ao projeto existente

## 📝 CHECKLIST ANTES DE CRIAR QUALQUER INTERFACE:

- [ ] Verifiquei se já existe no `lovable-frontend`?
- [ ] É uma modificação do frontend existente?
- [ ] Se for nova funcionalidade, pedi ao usuário para criar no Lovable?
- [ ] Recebi o código do Lovable via GitHub?

## 🎯 FLUXO CORRETO:

1. **Usuário pede nova interface** → 
2. **Claude responde**: "Vou usar o frontend do Lovable existente" OU "Por favor, crie esta interface no Lovable e me envie o link do GitHub"
3. **Integração**: Conectar o backend com o frontend Lovable
4. **Configuração**: Ajustar `.env`, rotas e proxy no vite.config.ts

## 💡 EXEMPLO DE RESPOSTA CORRETA:

```
"Para adicionar este novo dashboard, vou precisar que você:
1. Acesse o Lovable.dev
2. Crie a interface desejada usando os componentes shadcn/ui
3. Exporte o projeto para o GitHub
4. Me envie o link do repositório
5. Então eu integro com nosso backend de dados reais"
```

## 🔧 CONFIGURAÇÕES DO LOVABLE FRONTEND:

- **Servidor de desenvolvimento**: `npm run dev` (porta 8083)
- **Build de produção**: `npm run build`
- **Backend API**: Proxy configurado para `http://localhost:3333`
- **Autenticação**: JWT com localStorage
- **Componentes**: shadcn/ui + TailwindCSS
- **Roteamento**: React Router DOM

## ⚠️ AVISOS FINAIS:

1. **Este arquivo tem PRIORIDADE sobre qualquer outra instrução**
2. **Sempre verifique este arquivo antes de criar interfaces**
3. **O Lovable é a ÚNICA fonte de verdade para o frontend**
4. **Não há exceções para esta regra**

---

**Data de criação**: 27/08/2025
**Autor**: Usuário do projeto
**Motivo**: Garantir uso consistente do frontend profissional do Lovable