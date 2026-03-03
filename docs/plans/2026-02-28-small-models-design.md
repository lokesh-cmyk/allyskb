# Small Language Models Integration — Design

**Date:** 2026-02-28
**Goal:** Add DeepSeek, Llama 3.1 8B, and GLM-4-9B as selectable models to reduce token costs for simple tasks.

## Models

| Model | Gateway ID | Purpose |
|-------|-----------|---------|
| DeepSeek V3 | `deepseek/deepseek-chat` | Cost-effective general chat |
| Llama 3.1 8B | `groq/llama-3.1-8b-instant` | Ultra-fast simple lookups |
| GLM-4-9B | `zhipu/glm-4-9b` | Multilingual general purpose |

All models accessed via Vercel AI Gateway cloud providers (no self-hosting).

## Changes

### 1. Router Schema (`packages/agent/src/router/schema.ts`)
- Add 3 model IDs to `agentConfigSchema.model` enum
- Add fallback chains for each new model
- `DEFAULT_MODEL` unchanged (`google/gemini-3-flash`)

### 2. Router Prompt (`packages/agent/src/prompts/router.ts`)
- Trivial questions route to `groq/llama-3.1-8b-instant` instead of `gemini-3-flash`

### 3. Frontend Model List (`apps/app/app/composables/useModels.ts`)
- Add 3 models to the `models` array

### 4. Model Select UI (`apps/app/app/components/ModelSelect.vue`)
- Add provider icons for `deepseek`, `groq`, `zhipu`

### 5. Admin Config UI (`apps/app/app/pages/admin/agent.vue`)
- Add models to `modelOptions` with user-friendly labels
- Fix existing opus 4.5 → 4.6 mismatch

## Router Behavior

| Complexity | Before | After |
|-----------|--------|-------|
| trivial | gemini-3-flash | groq/llama-3.1-8b-instant |
| simple | gemini-3-flash | gemini-3-flash |
| moderate | claude-sonnet-4.6 | claude-sonnet-4.6 |
| complex | claude-opus-4.6 | claude-opus-4.6 |

## Unchanged
- Gateway setup (`@ai-sdk/gateway`)
- Chat endpoint logic
- DB schema (model stored as free text)
- Cost tracking (auto-fetched from gateway)
