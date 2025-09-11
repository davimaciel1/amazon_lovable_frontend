# 📋 DIRETRIZES DO PROJETO - NÃO DESVIAR DO FOCO!

## 🎯 OBJETIVO PRINCIPAL
**INTEGRAR os 3 componentes EXISTENTES:**
1. **Frontend**: Lovable (React + Vite + shadcn/ui) - JÁ EXISTE
2. **Backend**: API Express/Node.js - CRIAR APENAS O NECESSÁRIO
3. **Database**: PostgreSQL no Coolify - JÁ EXISTE

## ⚠️ REGRAS FUNDAMENTAIS - SEMPRE SEGUIR

### ✅ O QUE FAZER:
1. **USAR O FRONTEND LOVABLE EXISTENTE**
   - Modificar APENAS os arquivos necessários para conectar ao backend
   - Manter a estrutura e componentes originais
   - Preservar o design e UI do Lovable

2. **INTEGRAÇÃO FOCADA**
   - Criar serviços de API (api.ts)
   - Adaptar hooks de autenticação
   - Configurar variáveis de ambiente
   - Ajustar rotas se necessário

3. **BACKEND MÍNIMO**
   - Criar APENAS endpoints necessários
   - Autenticação JWT
   - Conexão com PostgreSQL existente
   - CORS configurado

### ❌ O QUE NÃO FAZER - NUNCA:
1. **NÃO criar páginas HTML de teste**
2. **NÃO criar componentes novos desnecessários**
3. **NÃO reescrever o que já existe no Lovable**
4. **NÃO criar interfaces alternativas**
5. **NÃO desviar do objetivo de integração**

## 🔄 FLUXO DE TRABALHO CORRETO

```
1. ANALISAR o que existe no Lovable
2. IDENTIFICAR pontos de integração necessários
3. MODIFICAR apenas o necessário para conectar
4. TESTAR a integração
5. DOCUMENTAR as mudanças
```

## 🚨 SINAIS DE DESVIO DE FOCO

Se estiver fazendo alguma dessas coisas, PARE:
- Criando arquivos .html
- Criando páginas "Test" ou "Simple"
- Reescrevendo componentes que já existem
- Criando interfaces alternativas
- Fazendo "soluções temporárias" que não usam o Lovable

## 📝 CHECKLIST DE INTEGRAÇÃO

Para cada tarefa, pergunte:
- [ ] Isso usa o frontend Lovable existente?
- [ ] Isso é necessário para a integração?
- [ ] Estou modificando o mínimo possível?
- [ ] Estou mantendo a UI original do Lovable?
- [ ] Isso conecta frontend → backend → database?

## 🎯 RESULTADO ESPERADO

O usuário deve:
1. Abrir o frontend LOVABLE (não uma página HTML)
2. Ver a interface ORIGINAL do Lovable
3. Fazer login/registro através da UI do Lovable
4. Navegar pelas páginas do Lovable
5. Ver dados do PostgreSQL através do backend

## ⚡ RESUMO EXECUTIVO

**MISSÃO**: Fazer o Lovable falar com o Backend que fala com o PostgreSQL

**NÃO É**: Criar um novo frontend ou páginas de teste

**FOCO**: INTEGRAÇÃO, não CRIAÇÃO

---

## 🔴 ALERTA VERMELHO

Se em algum momento estiver criando:
- `test.html`
- `AuthTest.tsx` 
- `AppSimple.tsx`
- Qualquer coisa "temporária"

**PARE IMEDIATAMENTE** e volte a trabalhar com os arquivos originais do Lovable!