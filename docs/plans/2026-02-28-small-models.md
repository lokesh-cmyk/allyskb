# Small Language Models Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add DeepSeek, Llama 3.1 8B, and GLM-4-9B as selectable models across router, frontend, and admin UI to reduce token costs.

**Architecture:** Add 3 new model IDs to the existing AI Gateway provider setup. Update the complexity router to use a small model for trivial tasks. No new dependencies or infrastructure — all models go through the existing `@ai-sdk/gateway`.

**Tech Stack:** Vercel AI SDK, AI Gateway, Nuxt 4, Vue 3

---

### Task 1: Add Small Models to Router Schema

**Files:**
- Modify: `packages/agent/src/router/schema.ts`

**Step 1: Add new model IDs to the agentConfigSchema enum**

In `packages/agent/src/router/schema.ts`, update the `model` field in `agentConfigSchema`:

```typescript
model: z.enum([
  'groq/llama-3.1-8b-instant',
  'deepseek/deepseek-chat',
  'zhipu/glm-4-9b',
  'google/gemini-3-flash',
  'anthropic/claude-sonnet-4.6',
  'anthropic/claude-opus-4.6',
]).describe('llama/deepseek/glm for trivial, flash for simple, sonnet for moderate, opus for complex'),
```

**Step 2: Add fallback chains for the new models**

Add these entries to `MODEL_FALLBACKS`:

```typescript
'groq/llama-3.1-8b-instant': ['deepseek/deepseek-chat', 'google/gemini-3-flash'],
'deepseek/deepseek-chat': ['groq/llama-3.1-8b-instant', 'google/gemini-3-flash'],
'zhipu/glm-4-9b': ['deepseek/deepseek-chat', 'google/gemini-3-flash'],
```

**Step 3: Verify the package builds**

Run: `cd packages/agent && bun run build`
Expected: Build succeeds with no type errors.

**Step 4: Commit**

```bash
git add packages/agent/src/router/schema.ts
git commit -m "feat: add small model IDs to router schema"
```

---

### Task 2: Update Router Prompt for Trivial Classification

**Files:**
- Modify: `packages/agent/src/prompts/router.ts`

**Step 1: Update the trivial classification to use a small model**

In `packages/agent/src/prompts/router.ts`, change the `ROUTER_SYSTEM_PROMPT` trivial entry:

```typescript
**trivial** (maxSteps: 4, model: groq/llama-3.1-8b-instant)
```

The full updated prompt string — only the trivial line changes:

```
**trivial** (maxSteps: 4, model: groq/llama-3.1-8b-instant)
- Simple greetings: "Hello", "Thanks", "Hi there"
- Acknowledgments without questions
- Examples: "Hi!", "Thank you!", "Got it"
```

All other complexity levels remain unchanged.

**Step 2: Verify build**

Run: `cd packages/agent && bun run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add packages/agent/src/prompts/router.ts
git commit -m "feat: route trivial questions to small model"
```

---

### Task 3: Add Small Models to Frontend Model List

**Files:**
- Modify: `apps/app/app/composables/useModels.ts`

**Step 1: Add the 3 new models to the models array**

In `apps/app/app/composables/useModels.ts`, update the `models` array inside `useModels()`:

```typescript
const models = [
  'groq/llama-3.1-8b-instant',
  'deepseek/deepseek-chat',
  'zhipu/glm-4-9b',
  'google/gemini-3-flash',
  'anthropic/claude-sonnet-4.6',
  'anthropic/claude-opus-4.6',
]
```

Small models listed first so users see the cheap options.

**Step 2: Commit**

```bash
git add apps/app/app/composables/useModels.ts
git commit -m "feat: add small models to frontend model list"
```

---

### Task 4: Add Provider Icons to ModelSelect Component

**Files:**
- Modify: `apps/app/app/components/ModelSelect.vue`

**Step 1: Add provider icon mappings for new providers**

In `apps/app/app/components/ModelSelect.vue`, update the `providerIcons` record:

```typescript
const providerIcons: Record<string, string> = {
  openai: 'i-simple-icons-openai',
  anthropic: 'i-simple-icons-anthropic',
  google: 'i-simple-icons-google',
  moonshotai: 'i-lucide-moon',
  deepseek: 'i-custom-bot',
  groq: 'i-custom-bot',
  zhipu: 'i-custom-bot',
}
```

Note: DeepSeek, Groq, and Zhipu don't have simple-icons entries, so we use `i-custom-bot` as fallback (same as the existing default in `getProviderIcon`). If the project has specific icons for these providers, swap them in.

**Step 2: Commit**

```bash
git add apps/app/app/components/ModelSelect.vue
git commit -m "feat: add provider icons for small model providers"
```

---

### Task 5: Add Small Models to Admin Config UI

**Files:**
- Modify: `apps/app/app/pages/admin/agent.vue`

**Step 1: Update modelOptions array**

In `apps/app/app/pages/admin/agent.vue`, replace the `modelOptions` array:

```typescript
const modelOptions = [
  { value: 'auto', label: 'Automatic (Recommended)' },
  { value: 'groq/llama-3.1-8b-instant', label: 'Lite — Llama 3.1 8B' },
  { value: 'deepseek/deepseek-chat', label: 'Lite — DeepSeek' },
  { value: 'zhipu/glm-4-9b', label: 'Lite — GLM-4' },
  { value: 'google/gemini-2.5-flash-lite', label: 'Fast' },
  { value: 'google/gemini-3-flash', label: 'Balanced' },
  { value: 'anthropic/claude-sonnet-4.6', label: 'Advanced — Sonnet' },
  { value: 'anthropic/claude-opus-4.6', label: 'Advanced — Opus' },
]
```

This also fixes the existing bug where `claude-opus-4.5` was listed instead of `claude-opus-4.6`.

**Step 2: Commit**

```bash
git add apps/app/app/pages/admin/agent.vue
git commit -m "feat: add small models to admin config and fix opus version"
```

---

### Task 6: Verify Full Build and Lint

**Step 1: Run lint**

Run: `bun run lint`
Expected: No new errors.

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No type errors.

**Step 3: Run full build**

Run: `bun run build`
Expected: Build succeeds.

**Step 4: Fix any issues found, then commit**

```bash
git add -A
git commit -m "chore: fix lint/type issues from small models integration"
```

(Skip this commit if no fixes were needed.)
