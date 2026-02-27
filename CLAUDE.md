# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies (requires Bun 1.2.22+)
bun install

# Dev server (starts Nuxt on port 3000)
bun run dev              # all workspaces
bun run dev:app          # app only (turbo --filter=@savoir/app)

# Build
bun run build            # all packages + app (turbo)

# Lint
bun run lint             # check
bun run lint:fix         # auto-fix

# Type check
bun run typecheck

# Tests (bun:test runner)
bun run test                                    # all
bun test packages/sdk/src/shell-policy.test.ts  # single file

# Database (run from apps/app/)
bun run db:generate      # generate Drizzle migrations
bun run db:migrate       # apply migrations

# Vercel Workflows (local)
bun run workflow         # start workflow web UI
```

## Architecture

**Monorepo** (`bun` workspaces + Turbo) with three packages and one app:

| Workspace | Package | Purpose |
|-----------|---------|---------|
| `packages/sdk` | `@savoir/sdk` | AI SDK-compatible tools (`bash`, `bash_batch`) + HTTP client |
| `packages/agent` | `@savoir/agent` | Agent factory, complexity router, system prompts, web search tool |
| `packages/github` | `@savoir/github` | GitHub App auth, repo API primitives, Nuxt module layer |
| `apps/app` | `@savoir/app` | Unified Nuxt 4 app: chat UI, API, bot integrations, admin panel |

Packages build before the app (`turbo run build` respects `^build` dependency).

### How the AI agent works

1. User message → `POST /api/chats/[id]` → stored in DB
2. `routeQuestion()` classifies complexity (trivial/simple/moderate/complex) via a lightweight model
3. Router selects model + max steps; admin `agentConfig` can override
4. Agent runs with `bash`/`bash_batch` tools that execute read-only commands in a Vercel Sandbox
5. Sandbox is pre-built from a snapshot repo containing synced knowledge sources
6. Response streams back to client via Vercel AI SDK

### Key server-side patterns

- **API routes**: `apps/app/server/api/` — all use `defineEventHandler()`, validated with Zod via `readValidatedBody(event, schema.parse)`
- **Auth**: Better Auth — `requireUserSession(event)` for protected routes, admin check via `user.role === 'admin'`
- **Database**: Drizzle ORM over PostgreSQL (NuxtHub) — schema at `apps/app/server/db/schema.ts`
- **Caching**: NuxtHub KV (never in-memory `Map` — serverless environment)
- **Bot adapters**: `apps/app/server/utils/bot/` — GitHub and Discord share the same agent pipeline
- **Workflows**: `apps/app/server/workflows/` — durable Vercel Workflows for content sync and snapshots

### Frontend

- Nuxt 4 + Nuxt UI + Tailwind CSS
- Pages at `apps/app/app/pages/`, components at `apps/app/app/components/`
- Composables at `apps/app/app/composables/` (e.g., `useChats`, `useAdmin`)

### Auto-imports (no manual imports needed)

| Directory | Available in |
|-----------|-------------|
| `app/composables/` | Client |
| `app/components/` | Client |
| `server/utils/` | Server |
| `shared/utils/` | Both |
| `shared/types/` | Both (via `#shared/types`) |

## Coding Conventions

- **ESLint**: `@hrcd/eslint-config` — run `bun run lint:fix` before committing
- **Comments**: Only when code is non-obvious. No section dividers in templates. Section dividers are OK in schema/data structures to group related fields.
- **ES modules**: `"type": "module"` throughout — use `import`/`export`, not `require`
- **Serverless-safe caching**: Use `hubKV()` for caching, never in-memory `Map` or module-level variables

## AI-Assisted Customization Skills

The `.agents/skills/` directory has step-by-step guides for common customization tasks. When asked to do one of these, follow the corresponding skill:

- `add-tool.md` — Add a new AI SDK tool
- `add-source.md` — Add a knowledge source type
- `add-bot-adapter.md` — Add a new bot platform adapter
- `rename-project.md` — Rename the project instance

## Environment

Required env vars go in `apps/app/.env` (see `apps/app/.env.example`). Three are mandatory:
- `BETTER_AUTH_SECRET` — session signing (`openssl rand -hex 32`)
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — GitHub OAuth

Optional: `AI_GATEWAY_API_KEY` (local dev AI), `NUXT_GITHUB_SNAPSHOT_REPO`, Discord/YouTube/Redis vars. Full list in `docs/ENVIRONMENT.md`.
