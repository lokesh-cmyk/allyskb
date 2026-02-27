# Composio Google Integration Design

## Goal

Let users connect their Google account and access Google services (Gmail, Calendar, Drive, etc.) directly through the AI chat agent, using Composio as the tool/auth orchestration layer.

## Decisions

- **Auth provider**: Replace GitHub OAuth with Google OAuth via Better Auth
- **User identity mapping**: Better Auth `user.id` → Composio `user_id`
- **Tool format**: Hybrid — MCP for tool execution, results flow through AI SDK natively
- **Tool scope**: Source (knowledge) chats only, not admin chats
- **Connection management**: Dedicated settings page + in-chat fallback via Composio Connect Links

## Section 1: Google Sign-In (Better Auth)

Replace GitHub OAuth with Google as the sole social login provider.

### Server auth config

`apps/app/server/auth.config.ts`:
- Remove the `github` social provider
- Add `google` social provider:

```typescript
google: {
  clientId: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  scope: ['openid', 'email', 'profile'],
  mapProfileToUser: (profile) => ({
    name: profile.name,
    image: profile.picture,
  }),
},
```

### Login page

`apps/app/app/pages/login.vue`:
- Replace "Continue with GitHub" button with "Continue with Google" (`i-simple-icons-google` icon)
- Rename `githubLoading` → `googleLoading`, `onGitHub` → `onGoogle`
- `onGoogle()` calls `signIn.social({ provider: 'google', callbackURL: '/' })`
- Update `oauthErrors` messages to reference Google instead of GitHub

### Settings page

`apps/app/app/pages/settings/index.vue`:
- In the "Connected accounts" section, replace GitHub with Google
- Change icon to `i-simple-icons-google`, label to "Google"
- Update `hasGithub` → `hasGoogle`, `linkGithub` → `linkGoogle`, `unlinkGithub` → `unlinkGoogle`
- All provider references change from `'github'` to `'google'`

### Environment

`apps/app/.env.example`:
- Remove `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`
- Add `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`

Env vars `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` already exist in `.env`.

## Section 2: Composio MCP + Hybrid Tool Integration

Integrate Composio's Google Super toolkit into the AI agent via MCP, merged alongside existing sandbox and web search tools.

### Dependencies

Add to `apps/app/package.json`:
- `@composio/core` — Composio SDK
- `@ai-sdk/mcp` — AI SDK MCP client (tools returned are natively compatible with `streamText`/`generateText`)

### New files

**`apps/app/server/utils/composio/types.ts`**

Shared constants and types:
- `COMPOSIO_TOOLKIT_SLUGS`: array of Google Super toolkit slugs (to be populated)
- KV key patterns: `composio:session:{userId}` for session caching

**`apps/app/server/utils/composio/client.ts`**

Composio session factory:
- Initializes `Composio` with `COMPOSIO_API_KEY` from env (`process.env.COMPOSIO_PLAYGROUND_API_KEY`)
- Exports `createComposioSession(userId, toolkitSlugs)`:
  1. Checks KV cache for existing session
  2. On miss: calls `composio.create(userId, { toolkits: toolkitSlugs })`
  3. Caches session MCP url/headers in KV with TTL
  4. Returns `{ mcp: { url, headers } }`

**`apps/app/server/utils/composio/tools.ts`**

Hybrid tool fetcher:
- Exports `getComposioTools(userId)`:
  1. Calls `createComposioSession(userId, COMPOSIO_TOOLKIT_SLUGS)`
  2. Creates MCP client: `createMCPClient({ transport: { type: 'http', url, headers } })`
  3. Fetches tools: `mcpClient.tools()`
  4. Returns tools object (AI SDK MCP tools are directly compatible)
  5. On any error (auth, network), returns empty object `{}` — graceful degradation

### Modified files

**`apps/app/server/api/chats/[id].post.ts`**

In the source chat branch (not admin):
```typescript
// After creating savoir tools
let composioTools = {}
try {
  composioTools = await getComposioTools(user.id)
} catch {
  // Composio unavailable — continue with sandbox tools only
}

const agent = createSourceAgent({
  tools: { ...savoir.tools, ...composioTools },
  // ... rest unchanged
})
```

**`packages/agent/src/prompts/chat.ts`**

Append to `BASE_SYSTEM_PROMPT`:
```
## Google Tools

You have access to Google tools (Gmail, Calendar, Drive, etc.) that operate on the user's connected Google account.
- Use these tools when the user asks about their emails, calendar events, documents, etc.
- If a Google tool returns an authentication error, tell the user they need to connect their Google account in Settings > Connections.
- Always search sandbox documentation FIRST. Only use Google tools for personal data queries.
```

### Data flow

```
Chat request (POST /api/chats/[id])
  → getComposioTools(user.id)
    → KV cache hit? → Return cached MCP client tools
    → Cache miss?   → composio.create(userId, { toolkits }) → cache → MCP client → tools
  → createSourceAgent({ tools: { ...savoir.tools, ...composioTools } })
  → Agent calls Google tools via MCP alongside bash/web_search
  → Results stream back through AI SDK UIMessageStream
```

### Environment

Env vars already in `.env`:
- `COMPOSIO_PLAYGROUND_API_KEY` — Composio API key
- `COMPOSIO_PROJECT_ID` — Composio project ID
- `COMPOSIO_AUTH_CONFIG_ID` — Auth config for Google Super toolkit
- `COMPOSIO_TOOLKIT_SLUG` — Toolkit slug (`googlesuper`)

Add to `apps/app/.env.example`:
```
# Composio (Google tools)
COMPOSIO_API_KEY=                # Composio API key
COMPOSIO_TOOLKIT_SLUG=googlesuper
```

## Section 3: Settings Connections Page + In-Chat Fallback

### New API endpoints

**`apps/app/server/api/connections/google.get.ts`**
- Auth: User session required
- Checks if the user has a connected Google account via Composio
- Returns `{ connected: boolean }`

**`apps/app/server/api/connections/google.post.ts`**
- Auth: User session required
- Creates a Composio session and initiates auth via `session.authorize()` or similar
- Returns `{ connectUrl: string }` — the Composio Connect Link

**`apps/app/server/api/connections/google.delete.ts`**
- Auth: User session required
- Disconnects the user's Google account from Composio
- Returns `{ success: boolean }`

### New settings page

**`apps/app/app/pages/settings/connections.vue`**

Follows the exact visual pattern of `settings/index.vue`:
- Page meta: `auth: 'user'`
- Header: "Connections" / "Manage your connected services for AI-powered tools."
- Back link to `/settings`
- Single card section:
  - Google icon (`i-simple-icons-google`)
  - Label: "Google"
  - Status: "Connected" or "Not connected" (fetched from `GET /api/connections/google`)
  - Action button:
    - Not connected → "Connect" button: calls `POST /api/connections/google`, opens `connectUrl` in new tab
    - Connected → "Disconnect" button: calls `DELETE /api/connections/google`
  - Loading skeleton states matching existing patterns

### Settings index link

**`apps/app/app/pages/settings/index.vue`**

Add a "Connections" link row in a new section (or alongside "API Keys" in the Developer section), following the same `NuxtLink` pattern as API Keys:

```html
<NuxtLink to="/settings/connections" class="flex items-center justify-between gap-4 px-4 py-3 hover:bg-elevated/50 transition-colors">
  <div class="flex items-center gap-3">
    <UIcon name="i-lucide-plug" class="size-5 text-highlighted" />
    <div>
      <p class="text-sm text-highlighted">Connections</p>
      <p class="text-xs text-muted">Connect Google and other services for AI access.</p>
    </div>
  </div>
  <UIcon name="i-lucide-chevron-right" class="size-4 text-muted" />
</NuxtLink>
```

### In-chat fallback

No custom code required. When a Google tool is called and the user hasn't connected, Composio returns an auth error in the tool result. The agent sees this and, guided by the prompt update in Section 2, tells the user to connect via Settings > Connections. Composio's built-in Connect Link mechanism handles the OAuth flow.

## File inventory

### New files
| File | Purpose |
|------|---------|
| `apps/app/server/utils/composio/types.ts` | Constants, KV keys, toolkit slugs |
| `apps/app/server/utils/composio/client.ts` | Composio session factory with KV caching |
| `apps/app/server/utils/composio/tools.ts` | MCP tool fetcher, graceful degradation |
| `apps/app/server/api/connections/google.get.ts` | Check Google connection status |
| `apps/app/server/api/connections/google.post.ts` | Initiate Google connection (Connect Link) |
| `apps/app/server/api/connections/google.delete.ts` | Disconnect Google account |
| `apps/app/app/pages/settings/connections.vue` | Connections management UI |

### Modified files
| File | Changes |
|------|---------|
| `apps/app/server/auth.config.ts` | Replace GitHub with Google social provider |
| `apps/app/app/pages/login.vue` | Replace GitHub button with Google button |
| `apps/app/app/pages/settings/index.vue` | Replace GitHub account with Google + add Connections link |
| `apps/app/server/api/chats/[id].post.ts` | Merge Composio tools into source agent |
| `packages/agent/src/prompts/chat.ts` | Add Google tools section to system prompt |
| `apps/app/.env.example` | Update env var documentation |
| `apps/app/package.json` | Add `@composio/core`, `@ai-sdk/mcp` |
