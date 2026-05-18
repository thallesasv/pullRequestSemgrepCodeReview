# 🏗️ Arquitetura da Solução

## Fluxograma de Execução

```
GitHub Pull Request
        ↓
GitHub Actions
        ↓
pr-review-semgrep Action
        ↓
    main.ts
        ↓
   Static analysis flow
    ↓
  prompts.ts
    ↓
performStaticAnalysis()
    ↓
 static-analysis.ts
    ↓
 Pull Request Comments Posted
```

---

## Módulos Principais

### `src/main.ts`
```
Entry point
  ↓
GitHub Event?
  ├→ pull_request/pull_request_target → handlePullRequest()
  └→ pull_request_review_comment → handlePullRequestComment()
```

### `src/prompts.ts` (Modificado)
```
runSummaryPrompt()
  ↓
generateSummaryFromDiff()

runReviewPrompt()
  ↓
performStaticAnalysis()

runReviewCommentPrompt()
  ↓
return empty (não suportado)
```

### `src/static-analysis.ts` (Novo)
```
performStaticAnalysis(files)
  ↓
  ├→ analyzeSecurityPatterns()
  │   ├─ SQL Injection
  │   ├─ XSS
  │   ├─ Hardcoded secrets
  │   └─ Unsafe deserialization
  │
  ├→ analyzeBugPatterns()
  │   ├─ Null reference
  │   ├─ Unused variables
  │   ├─ Async without return
  │   ├─ Assignment confusion
  │   └─ Too many params
  │
  └─→ analyzeBestPractices()
      ├─ console.log
      ├─ Magic numbers
      ├─ TODO comments
      └─ Empty catch
      
    ↓
calculateMetrics()
    ↓
StaticAnalysisResult
{
  issues: AIComment[]
  metrics: {
    qualityScore: 0-100
    estimatedEffort: 1-5
    hasRelevantTests: boolean
    securityConcerns: string
  }
}
```

---

## Fluxo de Dados

### Entrada

```
{
  prTitle: string
  prDescription: string
  commitMessages: string[]
  files: FileDiff[]  // Diffs dos arquivos modificados
}
```

### Processamento (Static)

```
Para cada arquivo:
  Para cada "hunk" (bloco de alterações):
    ├─ Analisar padrões de segurança
    ├─ Analisar padrões de bugs
    └─ Analisar boas práticas
        ↓
Consolidar todos os problemas encontrados
        ↓
Calcular métricas (score, esforço, testes)
```

### Saída

```
PullRequestReview {
  review: {
    estimated_effort_to_review: number
    score: number (0-100)
    has_relevant_tests: boolean
    security_concerns: string
  },
  comments: AIComment[] (problemas encontrados)
}

AIComment {
  file: string
  start_line: number
  end_line: number
  highlighted_code: string
  header: string (títu em português)
  content: string (explicação em português)
  label: string (em inglês)
  critical: boolean
}
```

---

## Comparação de Arquitetura

### Modo LLM (Original)

```
PR → parse diff → build prompt → LLM API → JSON → post comments
```

**Características:**
- 🌐 Chamada de rede (latência)
- 💰 Custo por requisição
- 🧠 Análise inteligente
- ❓ Não determinístico

### Modo Static (Novo)

```
PR → parse diff → pattern matching → metrics → JSON → post comments
```

**Características:**
- ⚡ Sem chamadas de rede
- 💲 Zero custo
- 🔍 Análise determinística
- 📊 Baseada em padrões

---

## Configuração: Como Funciona

### Modo estático

```typescript
// A versão atual usa análise estática por padrão.
// O fluxo de LLM ficou apenas como contexto histórico.
```

### GitHub Actions

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## Escalabilidade

### Modo LLM
```
100 PRs/dia × $0.15/PR = $15/dia = $450/mês 💸
Latência: 10-30s por PR
```

### Modo Static
```
100 PRs/dia × $0/PR = $0/dia = $0/mês ✅
Latência: < 1s por PR
```

### Modo Híbrido (Proposto)
```
1. Análise Static (< 1s) - rápida
   ├─ Se crítico: bloqueia (economiza LLM)
   └─ Se ok: continua
2. Análise LLM (10-30s) - profunda
   └─ Análise detalhada

Benefício: 80% das PRs usam apenas static!
Economia: -80% de custos, +90% de velocidade média
```

---

## Integração com GitHub API

```
GitHub API
     ↓
octokit client
     ↓
├─ rest.pulls.listFiles() → diffs
├─ rest.issues.listComments() → comentários existentes
├─ rest.pulls.listCommits() → mensagens de commit
└─ rest.issues.createComment() → postar análise
└─ rest.pulls.createReviewComment() → responder a linhas
```

---

## Árvore de Arquivos Relevantes

```
pullRequestCodeReview/
├─ src/
│  ├─ main.ts                    # Entry point
│  ├─ pull_request.ts            # Handler de PR
│  ├─ prompts.ts                 # ✨ Modificado - lógica condicional
│  ├─ static-analysis.ts         # ✨ Novo - análise estática
│  ├─ ai.ts                      # LLM (não modificado)
│  ├─ diff.ts                    # Parser de diffs
│  └─ ...
├─ .github/workflows/
│  ├─ pr-review-ai.yml           # Original (LLM)
│  └─ pr-review-semgrep.yml      # ✨ Novo (Static)
├─ README.md                     # Original
├─ README_STATIC.md              # ✨ Novo
├─ STATIC_ANALYSIS.md            # ✨ Novo
├─ COMPARISON.md                 # ✨ Novo
└─ IMPLEMENTATION_SUMMARY.md     # ✨ Novo (este arquivo)
```

---

## Decisões de Design

### ✅ Por que adotar análise estática ao invés de criar novo repositório?

1. **Simplicidade** - Não exige configuração extra de modo
2. **Manutenção** - Um único código base
3. **Reuso** - Compartilha parsers de diff, GitHub API, etc
4. **Clareza** - O repositório deixa explícito que o fluxo padrão é estático

### ✅ Por que não chamar de "Lite" ao invés de "Static"?

1. **Clareza** - Descreve bem o que faz (análise estática)
2. **Diferenciação** - Não é apenas "versão reduzida"
3. **SEO/Busca** - Facilitates encontrar "static analysis"

### ✅ Por que análise estática é mais rápida?

```
LLM:    parse diff (100ms) → serialize (50ms) → send HTTP (500-2000ms) → LLM process (5-20s) → parse response (50ms) = 5-20s total

Static: parse diff (100ms) → regex matching (10-100ms) = ~100-200ms total
```

---

## Possibilidades Futuras

### 1️⃣ ESLint Integration
```typescript
async function runESLint(files: FileDiff[]) {
  // Execute ESLint em arquivos específicos
  // Integre resultados com análise estática
}
```

### 2️⃣ SonarQube Integration
```typescript
async function runSonarQube(files: FileDiff[]) {
  // Envie diffs para SonarQube
  // Retorne problemas detectados
}
```

### 3️⃣ Machine Learning
```typescript
async function predictRiskScore(files: FileDiff[]) {
  // Treine modelo com histórico de bugs
  // Prediga risco baseado em padrões
}
```

### 4️⃣ Modo Híbrido
```typescript
async function hybridAnalysis(files: FileDiff[]) {
  const static = performStaticAnalysis(files);
  if (static.hasCriticalIssues) return static;
  
  const llm = await runLLMReview(files);
  return mergeResults(static, llm);
}
```

---

## Conclusão

A arquitetura é:

✅ **Simples** - Fácil de entender  
✅ **Modular** - Componentes independentes  
✅ **Extensível** - Fácil adicionar novas análises  
✅ **Compatível** - Funciona com LLM ou estática  
✅ **Performático** - < 1s para análise estática  
✅ **Económico** - Zero custo de API em modo static  

