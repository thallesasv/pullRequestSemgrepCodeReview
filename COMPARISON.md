# Comparação: LLM vs Análise Estática

Este documento compara as duas versões do PR Review AI para ajudá-lo a escolher qual usar.

## Resumo Executivo

| Aspecto | LLM | Análise Estática |
|--------|-----|------------------|
| **Custo** | Caro ($$ por API) | Grátis |
| **Velocidade** | Lento (10-30s) | Rápido (< 1s) |
| **Dependência** | APIs externas | Nenhuma |
| **Segurança** | Dados enviados à API | Offline |
| **Bugs complexos** | Detecta bem | Parcial |
| **Vulnerabilidades óbvias** | Detecta bem | Detecta bem |
| **Análise semântica** | Excelente | Não faz |
| **Comentários interativos** | Sim | Não |

## Detalhamento

### LLM (Modo Padrão)

**Quando usar:**
- ✅ Você tem orçamento para APIs
- ✅ Quer análise inteligente de bugs lógicos
- ✅ Quer gerar títulos/descrições automáticas
- ✅ Quer responder comentários sobre PR
- ✅ Quer análise semântica profunda
- ✅ Quer sugestões criativas de refatoração

**Exemplo de detecção:**
```javascript
// LLM pode detectar problemas como:
// "Esta lógica de filtro está invertida, causando bugs"
// "Esta função não retorna após await"
// "Este padrão é inseguro porque..."
users.filter(u => !u.isActive) // Deveria ser u.isActive?
  .map(u => u.email)
  .sendEmail()
```

**Custo por PR:**
- Anthropic Claude: ~$0.05-$0.20
- OpenAI GPT-4: ~$0.10-$0.30
- Google Gemini: ~$0.02-$0.10

**Configuração necessária:**
```yaml
env:
  LLM_API_KEY: ${{ secrets.LLM_API_KEY }}
  LLM_MODEL: "claude-sonnet-4-5"
  LLM_PROVIDER: "anthropic"
```

---

### Análise Estática (Novo Modo)

**Quando usar:**
- ✅ Você quer análise **sem custos**
- ✅ Quer análise **offline** (sem APIs externas)
- ✅ Quer **velocidade** (análise em < 1 segundo)
- ✅ Quer detectar problemas **óbvios/padrões**
- ✅ Tem budget limitado
- ✅ Quer ferramenta **determinística** e **previsível**

**Exemplo de detecção:**
```typescript
// Análise estática detecta:

// ❌ SQL Injection
const query = `SELECT * FROM users WHERE id = ${userId}`

// ❌ XSS
element.innerHTML = userInput

// ❌ Credencial hardcoded
const apiKey = "sk-1234567890abcdef"

// ❌ console.log em produção
console.log("Debug:", userData)

// ❌ Variável não usada
const unusedVar = fetchData()

// ❌ Número mágico
setTimeout(() => doSomething(), 5000) // Deveria ser constante

// ❌ Bloco catch vazio
try {
  risky()
} catch (e) {
  // Sem tratamento!
}
```

**Custo:**
```
Grátis! 🎉
```

**Configuração necessária:**
```yaml
env:
  # Pronto! Nenhuma API key necessária
```

---

## Casos de Uso Recomendados

### Use LLM se:

```
- Você tem um repositório crítico/production
- Você quer análise inteligente e contextual
- Você tem orçamento para APIs
- Você precisa de feedback em português natural
- Você quer sugestões criativas de refatoração
```

**Exemplo:**
Repositório de backend de e-commerce crítico → Use LLM

### Use Análise Estática se:

```
- Você quer análise rápida e gratuita
- Você quer detectar vulnerabilidades óbvias
- Você não tem orçamento para APIs
- Você quer análise offline
- Você quer primeira camada de review automático
```

**Exemplo:**
Repositório de aprendizado, prototipagem, ou complementar a análise LLM → Use Estática

### Use Ambas (Híbrido) se:

```
- Primeira análise rápida e gratuita: Estática (< 1s)
- Se houver problemas óbvios: Bloqueio
- Se passar na análise estática: LLM para análise profunda
- Resultado final: mais seguro e com melhor custo-benefício
```

---

## Exemplos Práticos

### Exemplo 1: Repositório Open Source

**Cenário:** Projeto open source com muitos contribuidores
**Solução:** Análise Estática
**Motivo:**
- Custos com múltiplas PRs = inviável com LLM
- Análise estática pega a maioria dos problemas óbvios
- Mantainers focam em análise manual profunda

### Exemplo 2: Startup com Orçamento

**Cenário:** Startup com código crítico e orçamento de APIs
**Solução:** LLM
**Motivo:**
- Qualidade crítica
- Orçamento disponível
- Quer análise semântica profunda

### Exemplo 3: Empresa com Padrões Rígidos

**Cenário:** Empresa com style guide e conventions específicas
**Solução:** Análise Estática + ESLint + Prettier
**Motivo:**
- Regras determinísticas e previsíveis
- Fácil customizar com novas regras
- Funciona offline

---

## Estendendo Análise Estática

Se você usar análise estática, pode adicionar suas próprias regras:

```typescript
// src/static-analysis.ts

function analyzeCompanyGuidelines(hunk: Hunk): AIComment[] {
  const comments: AIComment[] = [];
  
  // Sua regra: "Sempre usar arrow functions"
  if (/function\s+\w+\s*\(/.test(hunk.diff)) {
    comments.push({
      // ...
      header: "Use arrow functions",
      content: "Nosso style guide recomenda arrow functions ao invés de função declaration",
      label: "best practice",
      critical: false,
    });
  }
  
  return comments;
}
```

---

## Suporte de Linguagens

### Análise Estática - Linguagens

A análise estática funciona bem com:
- **Excelente:** JavaScript, TypeScript
- **Bom:** Python, Java, C#, Go, PHP, Ruby
- **Básico:** Qualquer linguagem (padrões genéricos apenas)

**Exemplo:** Seu repositório tem código em 3 linguagens diferentes?
Análise estática funciona em TODAS! 🎉

### LLM - Linguagens

LLM funciona teoricamente com qualquer linguagem, mas:
- Otimizado para linguagens populares
- Pode ter limitações com linguagens obscuras
- Análise mais profunda independente da linguagem

---

## Roadmap

### Versão Atual
- ✅ LLM com suporte a múltiplos providers
- ✅ Análise Estática básica
- ✅ Modo offline

### Futuro (Planejado)
- 🔄 Modo Híbrido (estática rápida + LLM para falhas)
- 🔄 ESLint integration
- 🔄 Customização de regras por repositório
- 🔄 Banco de dados de problemas para machine learning
- 🔄 Análise de performance

---

## Conclusão

**Escolha LLM** se quer inteligência e análise profunda.
**Escolha Análise Estática** se quer velocidade, custo zero, e offline.
**Use ambas** se quer o melhor dos dois mundos.

