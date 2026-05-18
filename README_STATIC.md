# PR Review AI - Static Analysis Edition

> **Análise automática de Pull Requests usando apenas análise estática, sem dependência de LLM**

<div align="center">

⚡ **Análise em < 1 segundo**  
💰 **Totalmente grátis** (sem custos de API)  
🔒 **Offline** (sem enviar código a serviços externos)  
🛡️ **Detecta vulnerabilidades óbvias**

[📚 Documentação](#documentação) • [🚀 Quick Start](#quick-start) • [📊 Comparação com LLM](COMPARISON.md)

</div>

---

## O que é?

PR Review AI - Static Edition é uma ferramenta de análise automática de código para GitHub que funciona **sem LLM**, usando apenas **análise de padrões estáticos** para detectar:

- 🔓 **Vulnerabilidades** → SQL injection, XSS, hardcoded secrets
- 🐛 **Bugs comuns** → Variáveis nulas, código não utilizado
- ⚠️ **Problemas de qualidade** → console.log, números mágicos, catch vazio
- 📊 **Métricas** → Score de qualidade, esforço de revisão, detecção de testes

## Quick Start

### 1️⃣ Configurar GitHub Actions

Crie `.github/workflows/pr-review.yml`:

```yaml
name: PR Review AI

permissions:
  contents: read
  pull-requests: write

on:
  pull_request_target:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: thallesasv/pullRequestCodeReview@main
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 2️⃣ Pronto! 🎉

Nenhuma configuração adicional necessária. Nenhuma API key. Nenhum custo.

---

## Documentação

### 📖 Arquivos de Documentação

- **[STATIC_ANALYSIS.md](STATIC_ANALYSIS.md)** - Como usar e estender
- **[COMPARISON.md](COMPARISON.md)** - LLM vs Análise Estática
- **[README.md](README.md)** - Documentação original do projeto

### 🔍 O que é Detectado

#### Segurança
- SQL injection patterns
- XSS (innerHTML, dangerouslySetInnerHTML)
- Credenciais hardcoded
- Desserialização insegura

#### Bugs
- Referências a variáveis nulas/indefinidas
- Variáveis declaradas mas não usadas
- Funções assíncronas sem return
- Confusão entre `=` e `==`/`===`
- Muitos parâmetros em função

#### Boas Práticas
- console.log/console.error em produção
- Números mágicos sem constante
- TODO/FIXME/HACK comments
- Blocos catch vazios

## 🌍 Suporte de Linguagens

### Quais Linguagens São Suportadas?

| Linguagem | Suporte | Status |
|-----------|---------|--------|
| **JavaScript/TypeScript** | ✅ Excelente | Otimizado completamente |
| **Python** | ✅ Bom | Todos os padrões genéricos |
| **Java** | ✅ Bom | Padrões principais |
| **C#** | ✅ Bom | Padrões principais |
| **Go** | ✅ Bom | Padrões principais |
| **PHP** | ✅ Bom | Padrões principais |
| **Ruby** | ✅ Bom | Padrões genéricos |
| **Outras** | ⚠️ Básico | Apenas padrões universais |

### O Que Funciona em Todas as Linguagens?

✅ **Segurança**
- SQL Injection: `query(` com interpolação
- Hardcoded Secrets: `password`, `api_key`, `token`
- Unsafe Eval: `eval`, `pickle.load`, `yaml.load`

✅ **Qualidade**
- Console/Debug: `console.log`, `print`, `println`
- Magic Numbers: números grandes sem nome
- Empty Handlers: `catch` ou `except` vazios

### JavaScript/TypeScript - Detecção Especial

Além dos padrões genéricos, JavaScript/TypeScript detecta:
- XSS: `innerHTML`, `dangerouslySetInnerHTML`
- Null Reference: verificação de `.` em possíveis nulls
- Async/Await: funções `async` sem `return`
- Arrow Functions: problemas de contexto

### Como Estender para Sua Linguagem?

Ver [STATIC_ANALYSIS.md](STATIC_ANALYSIS.md#estender-para-sua-linguagem) para exemplos de como adicionar suporte a novas linguagens.

---

## Características

| Recurso | Static | LLM* |
|---------|--------|-----|
| **Análise de segurança** | ✅ | ✅ |
| **Detecção de bugs** | ✅ (padrões) | ✅ (inteligente) |
| **Velocidade** | ⚡ < 1s | 10-30s |
| **Custo** | Grátis | Pago |
| **Análise semântica** | ❌ | ✅ |
| **Respostas interativas** | ❌ | ✅ |
| **Offline** | ✅ | ❌ |
| **Customização** | Fácil | Difícil |

*Requer OpenAI/Anthropic/Google API key

---

## Exemplo de Uso

### Seu PR tem:
```typescript
// ❌ SQL injection
const query = `SELECT * FROM users WHERE id = ${id}`

// ❌ console.log em produção
console.log("userData:", user)

// ❌ Variável não usada
const result = fetchData()
```

### Análise Estática detecta:
```
🚨 PONTOS DE AÇÃO (3)

security: SQL injection possible
  → Use parameterized queries instead

best practice: console.log in production
  → Remove debug statements before merge

possible bug: Unused variable
  → Variable 'result' is declared but never used
```

---

## Executar Localmente

### Instalação
```bash
git clone https://github.com/thallesasv/pullRequestCodeReview.git
cd pullRequestCodeReview
npm install
npm run build
```

### Uso
```bash
# Executar CLI em modo análise estática
GITHUB_TOKEN=your_token npm run review

# Ou com Node
node dist/cli.js
```

---

## Estender Análise

Adicione suas próprias regras em `src/static-analysis.ts`:

```typescript
function analyzeMyRules(hunk: Hunk, filename: string): AIComment[] {
  const comments: AIComment[] = [];
  
  // Sua regra aqui
  if (/my-pattern/.test(hunk.diff)) {
    comments.push({
      file: filename,
      start_line: 10,
      end_line: 10,
      highlighted_code: "...",
      header: "Meu aviso",
      content: "Descrição do problema",
      label: "best practice",
      critical: false,
    });
  }
  
  return comments;
}
```

Depois chame em `performStaticAnalysis()`:
```typescript
const myIssues = analyzeMyRules(hunk, file.filename);
allComments.push(...myIssues);
```

---

## Performance

| Métrica | Valor |
|---------|-------|
| Tempo de análise | < 1 segundo |
| Custo por PR | $0 |
| Dependências externas | 0 |
| Requisições de API | 0 |
| Limite de requisições | ∞ |

---

## Comparação com LLM

**Quer entender quando usar análise estática vs LLM?**

Veja [COMPARISON.md](COMPARISON.md) para:
- Tabela de comparação detalhada
- Casos de uso recomendados
- Exemplos práticos
- Modo híbrido (ambas)

---

## Troubleshooting

### P: Por que não há comentários nos arquivos?
A: Em modo static, comentários interativos não são suportados (requer LLM).

### P: Posso desabilitar certas regras?
A: Não no momento. Você pode:
1. Remover o arquivo de análise específico
2. Comentar a linha que chama a função
3. Modificar `static-analysis.ts` para suas necessidades

### P: Como contribuir com mais regras?
A: Envie um pull request com suas regras adicionadas em `performStaticAnalysis()`!

---

## Limitações

✋ **Análise estática não detecta:**
- Bugs lógicos sofisticados (requer semântica)
- Análise de fluxo de dados complexa
- Problemas contextuais (requer entendimento global)
- Sugestões criativas de refatoração

**Precisou de mais?** Use [LLM mode](COMPARISON.md) ou combine com ESLint, SonarQube, etc.

---

## Roadmap

- ✅ Análise de segurança
- ✅ Detecção de bugs comuns
- ✅ Métricas de qualidade
- 🔄 ESLint integration
- 🔄 Customização por repositório
- 🔄 Modo híbrido (estática + LLM)

---

## Contribuindo

Contribuições são bem-vindas! Para adicionar novas regras:

1. Fork o repositório
2. Crie uma branch (`git checkout -b feature/nova-analise`)
3. Adicione a análise em `src/static-analysis.ts`
4. Teste com `npm test`
5. Envie um pull request

---

## License

MIT

---

## Comparação Rápida

**Quer usar com LLM?** → [Versão LLM Original](README.md)  
**Quer entender diferenças?** → [Comparação Detalhada](COMPARISON.md)  
**Quer aprender a estender?** → [Documentação Técnica](STATIC_ANALYSIS.md)

---

## Versão

- **Static Analysis:** v1.0.0
- **Base PR Review AI:** Original
- **Status:** ✅ Production Ready
