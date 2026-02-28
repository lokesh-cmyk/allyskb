# Claude Code CLI Usage Tracking — Design

## Goal

Track per-developer Claude Code CLI usage in the admin dashboard so admins can monitor productivity, efficiency, and estimated costs.

## Context

The team uses Claude Max ($200/month), which does not expose an Admin API. Usage data must be collected from developers' local Claude Code CLI instances via hooks.

## Architecture

```
Developer's Machine                          App (Admin Dashboard)
┌──────────────────────┐                    ┌─────────────────────────┐
│ Claude Code CLI      │                    │ Nuxt App               │
│                      │                    │                        │
│ .claude/settings.json│                    │ POST /api/cli-usage    │
│   └─ Stop hook ──────┼───── HTTP POST ───→│   └─ Upsert to DB     │
│                      │   (Bearer token)   │                        │
│ ~/.claude/           │                    │ GET /api/admin/cli-usage│
│   └─ cli-tracker-token                    │   └─ Aggregate & serve │
│   └─ usage-buffer/   │                    │                        │
│      └─ *.json       │                    │ /admin/stats           │
│      (offline fallback)                   │   └─ CLI Usage tab     │
└──────────────────────┘                    └─────────────────────────┘
```

### Flow

1. Developer authenticates once via browser OAuth (existing GitHub OAuth)
2. App generates a unique API token, stored locally at `~/.claude/cli-tracker-token`
3. A `Stop` hook fires on every agent response
4. Hook reads session JSONL file, extracts cumulative stats
5. POSTs stats to app API (upsert by session ID)
6. On network failure, buffers locally and retries on next Stop
7. Admin dashboard aggregates and displays per-user usage

## Database

New `cliUsage` table:

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| userId | UUID FK | Links to user table |
| sessionId | text (unique) | Claude Code session UUID |
| project | text | Project directory name |
| model | text | Model used (e.g. claude-opus-4-6) |
| inputTokens | integer | Cumulative input tokens |
| outputTokens | integer | Cumulative output tokens |
| turns | integer | Conversation turns |
| toolCalls | integer | Tool invocations |
| durationMs | integer | Session duration |
| startedAt | timestamp | Session start |
| lastActiveAt | timestamp | Updated on each Stop |
| metadata | JSONB | Git branch, extra context |
| createdAt | timestamp | Row created |
| updatedAt | timestamp | Row updated |

Indexed on: `userId`, `sessionId` (unique), `createdAt`.

## Authentication

Reuses the existing Better Auth API key system (no new tables needed):

- Developer creates an API key from `/settings/api-keys` (already exists)
- Better Auth's `apiKey` plugin with `enableSessionForAPIKeys: true` means any API key authenticates as the owning user
- Hook sends the key via `Authorization: Bearer <key>` header
- The `/api/cli-usage` endpoint uses `requireUserSession(event)` — works automatically with API keys

## Developer setup

### Setup script (`scripts/cli-tracker-setup.sh`)

1. Prompts developer for app URL and API token
2. Saves token to `~/.claude/cli-tracker-token`
3. Copies hook script to `~/.claude/hooks/cli-tracker.sh`
4. Adds hook config to `~/.claude/settings.json`

### Hook script (`~/.claude/hooks/cli-tracker.sh`)

Fires on every `Stop` event:

1. Reads stdin JSON → gets `session_id`, `cwd`
2. Locates session JSONL: `~/.claude/projects/[encoded-cwd]/sessions/[session_id].jsonl`
3. Parses JSONL → extracts token counts, model, turns, tool calls, timestamps
4. Reads token from `~/.claude/cli-tracker-token`
5. POSTs to `<APP_URL>/api/cli-usage`
6. On failure → writes to `~/.claude/usage-buffer/[session_id].json`
7. On success → also syncs any buffered entries

Timeout: 10 seconds max.

## API endpoints

### POST /api/cli-usage (API-key authenticated)

- Auth: Better Auth API key via `requireUserSession(event)`
- Body: `{ sessionId, project, model, inputTokens, outputTokens, turns, toolCalls, durationMs, startedAt, lastActiveAt, metadata }`
- Action: Upsert `cliUsage` row by `sessionId`
- Response: `{ ok: true }`

### GET /api/admin/cli-usage (admin only)

- Auth: Admin session
- Query: `days` (7/30/90), `userId` (optional)
- Returns: Per-user aggregated stats, daily breakdowns, model breakdown

## Admin dashboard

New "CLI Usage" tab on `/admin/stats`:

### Summary cards
- Total CLI Sessions
- Total CLI Tokens
- Estimated CLI Cost ($)
- Active CLI Users

### Per-user table
| Developer | Sessions | Turns | Tokens | Est. Cost | Last Active |
|-----------|----------|-------|--------|-----------|-------------|
| Alice     | 45       | 312   | 1.2M   | $18.40    | 2h ago      |

### Charts
- Daily CLI usage over time (stacked bar)
- Model breakdown per user

## Data consistency

- **Upsert by sessionId**: Each Stop event updates the same row with latest cumulative data
- **Local buffer**: Failed POSTs are buffered to `~/.claude/usage-buffer/` and retried on next Stop
- **No gaps**: Even if a session is killed, we have data from the last successful Stop
- **Deduplication**: sessionId uniqueness constraint prevents duplicate entries

## Cost estimation

Uses existing model pricing utility (`server/utils/model-pricing.ts`) to estimate costs from token counts.
