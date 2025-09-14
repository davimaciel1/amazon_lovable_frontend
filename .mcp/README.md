# 🚀 MCP Server Mercado Livre - Configuração

> **Acelere seu desenvolvimento** com o assistente IA oficial do Mercado Livre integrado ao seu IDE!

## 🎯 O que é?

O **MCP Server oficial do Mercado Livre** permite que assistentes de IA (Claude, GPT-4, etc.) acessem diretamente a documentação oficial do ML e gerem código de integração automaticamente.

### ✅ Funcionalidades:
- 📚 **Busca na documentação oficial** em tempo real
- 🤖 **Geração automática de código** para APIs do ML  
- 💡 **Assistente especializado** em Mercado Livre
- 🔄 **Suporte a múltiplos IDEs** (Cursor, Windsurf, Cline, etc.)

---

## ⚡ Setup Rápido

### 1. **Gere seu Access Token**
```bash
cd amazon-unified-backend
npm run mcp:token:generate
```

### 2. **Configure o Token no Replit**
- Copie o token gerado
- Vá em **Secrets** no Replit
- Adicione: `ML_ACCESS_TOKEN` = `seu_token_aqui`

### 3. **Configure seu IDE**
```bash
npm run mcp:setup
```

---

## 🔧 Configuração por IDE

### 📝 **Cursor**
1. **Automática**: Clique no botão de instalação após executar `npm run mcp:setup`
2. **Manual**: 
   - Abra: `Cursor Settings > Tools & Integrations > New MCP Server`
   - Cole o conteúdo de: `.mcp/cursor-config.json`

### 🌪️ **Windsurf**
1. Abra: `Cascade > MCP Servers > Configure`  
2. Cole o conteúdo de: `.mcp/windsurf-config.json`

### 🛠️ **Outros IDEs** (Cline, Claude Desktop)
- Use a configuração de: `.mcp/general-config.json`

---

## 🎮 Como Usar

Após configurar, você pode perguntar ao assistente IA:

### 💬 **Exemplos de Comandos:**
```
"Como implementar checkout do Mercado Livre?"
"Gere código para buscar produtos pela API"
"Qual endpoint para atualizar estoque?"
"Implemente webhook de pagamentos"
"Como fazer upload de imagens de produtos?"
"Crie integração com Mercado Pago"
```

### 🔍 **Ferramentas Disponíveis:**
- **`search_documentation`**: Busca termos na documentação oficial
- **`get_documentation_page`**: Obtém páginas específicas da documentação

---

## 🛠️ Scripts Disponíveis

```bash
# Configuração completa
npm run mcp:setup

# Gerenciar tokens
npm run mcp:token:generate     # Gera novo token
npm run mcp:token:validate     # Valida token existente
npm run mcp:token              # Menu de ajuda

# Instalação completa
npm run mcp:install            # Instala dependências + configuração
```

---

## ⚠️ Troubleshooting

### **Token inválido ou IDE não conecta:**
1. Verifique se `ML_ACCESS_TOKEN` está configurado no Replit
2. Teste o token: `npm run mcp:token:validate`
3. Gere novo token se necessário: `npm run mcp:token:generate`

### **IDE fica "Loading Tools":**
- Certifique-se que o token está no formato: `Bearer YOUR_TOKEN`
- Reinicie o IDE após configurar
- Verifique se não há espaços extras no token

---

## 📋 Estrutura dos Arquivos

```
.mcp/
├── cursor-config.json      # Configuração para Cursor
├── windsurf-config.json    # Configuração para Windsurf  
├── general-config.json     # Configuração para outros IDEs
├── setup.js               # Script de configuração
├── ml-token-helper.js     # Helper para tokens ML
└── README.md              # Este arquivo
```

---

## 🎯 Próximos Passos

1. ✅ Configure um dos IDEs acima
2. 🤖 Teste fazendo perguntas sobre APIs do ML
3. 🚀 Use para acelerar desenvolvimento de novas features
4. 💡 Explore geração automática de código

---

> **💡 Dica**: O MCP Server é especialmente útil para implementar **novas integrações** e **descobrir APIs** que você ainda não usa no seu projeto.

**🔗 Documentação oficial**: https://developers.mercadolivre.com.br/pt_br/server-mcp