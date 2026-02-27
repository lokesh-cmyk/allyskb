# Composio Google Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace GitHub OAuth with Google sign-in, integrate Composio's Google Super toolkit as AI agent tools via MCP, and add a settings page for managing the Google connection.

**Architecture:** Composio SDK creates per-user MCP sessions scoped to Google toolkit slugs. The AI SDK MCP client fetches tools that are natively compatible with `streamText`/`generateText` and merges them into the source agent alongside existing sandbox and web search tools. A settings page and API endpoints let users manage their Google connection via Composio Connect Links.

**Tech Stack:** Better Auth (Google OAuth), @composio/core, @ai-sdk/mcp, Nuxt 4, Nuxt UI, NuxtHub KV

**Design doc:** `docs/plans/2026-02-27-composio-google-integration-design.md`

---

### Task 1: Replace GitHub OAuth with Google in Better Auth

**Files:**
- Modify: `apps/app/server/auth.config.ts`
- Modify: `apps/app/.env.example`

**Step 1: Update server auth config**

Replace the `github` social provider with `google` in `apps/app/server/auth.config.ts`:

```typescript
socialProviders: {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    scope: ['openid', 'email', 'profile'],
    mapProfileToUser: (profile: { name: string, picture: string }) => ({
      name: profile.name,
      image: profile.picture,
    }),
  },
},
```

Remove the entire `github: { ... }` block and its `scope`/`mapProfileToUser`.

**Step 2: Update .env.example**

In `apps/app/.env.example`, replace:

```
GITHUB_CLIENT_ID=            # GitHub OAuth app client ID
GITHUB_CLIENT_SECRET=        # GitHub OAuth app client secret
```

With:

```
GOOGLE_CLIENT_ID=            # Google OAuth client ID
GOOGLE_CLIENT_SECRET=        # Google OAuth client secret
```

**Step 3: Verify dev server starts**

Run: `cd apps/app && bun run dev`
Expected: Server starts without auth config errors. The `/api/auth` routes should be available.

**Step 4: Commit**

```bash
git add apps/app/server/auth.config.ts apps/app/.env.example
git commit -m "feat(auth): replace GitHub OAuth with Google sign-in"
```

---

### Task 2: Update login page for Google

**Files:**
- Modify: `apps/app/app/pages/login.vue`

**Step 1: Replace GitHub button with Google**

In `apps/app/app/pages/login.vue`, make these changes:

1. Rename the ref and handler:

```typescript
const googleLoading = ref(false)
```

Replace `githubLoading` entirely.

2. Replace the `onGitHub` function:

```typescript
function onGoogle() {
  googleLoading.value = true
  signIn.social({ provider: 'google', callbackURL: '/' })
}
```

3. Update `oauthErrors`:

```typescript
const oauthErrors: Record<string, string> = {
  access_denied: 'Access denied by Google.',
  server_error: 'Google encountered an error. Please try again.',
  temporarily_unavailable: 'Google is temporarily unavailable. Please try again later.',
}
```

4. Replace the button in template:

```html
<UButton
  label="Continue with Google"
  icon="i-simple-icons-google"
  color="neutral"
  variant="outline"
  block
  size="lg"
  :loading="googleLoading"
  @click="onGoogle"
/>
```

**Step 2: Verify login page renders**

Run: `cd apps/app && bun run dev`
Navigate to `/login`. Expected: Google button visible, no GitHub button.

**Step 3: Commit**

```bash
git add apps/app/app/pages/login.vue
git commit -m "feat(auth): update login page with Google sign-in button"
```

---

### Task 3: Update settings page — replace GitHub with Google account

**Files:**
- Modify: `apps/app/app/pages/settings/index.vue`

**Step 1: Replace GitHub linked account with Google**

In `apps/app/app/pages/settings/index.vue`:

1. Rename all GitHub-related refs and computed properties:

```typescript
const isLinkingGoogle = ref(false)

const hasGoogle = computed(() => accounts.value?.data?.some((a: any) => a.providerId === 'google'))
```

Remove `isLinkingGithub`, `hasGithub`.

2. Replace `linkGithub`:

```typescript
async function linkGoogle() {
  isLinkingGoogle.value = true
  try {
    await client!.linkSocial({ provider: 'google' })
  } catch (e) {
    showError(e, { fallback: 'Failed to link Google' })
    isLinkingGoogle.value = false
  }
}
```

3. Replace `unlinkGithub`:

```typescript
async function unlinkGoogle() {
  isUnlinking.value = true
  try {
    await client!.unlinkAccount({ providerId: 'google' })
    await refreshAccounts()
    toast.add({ title: 'Google account unlinked', icon: 'i-lucide-check' })
  } catch (e) {
    showError(e, { fallback: 'Failed to unlink account' })
  } finally {
    isUnlinking.value = false
  }
}
```

4. In the template, replace the GitHub connected account block:

```html
<div v-else class="flex items-center justify-between gap-4 px-4 py-3">
  <div class="flex items-center gap-3">
    <UIcon name="i-simple-icons-google" class="size-5 text-highlighted" />
    <div>
      <p class="text-sm text-highlighted">
        Google
      </p>
      <p class="text-xs text-muted">
        {{ hasGoogle ? 'Connected' : 'Not connected' }}
      </p>
    </div>
  </div>
  <UButton
    v-if="hasGoogle"
    label="Unlink"
    color="neutral"
    variant="ghost"
    size="xs"
    :loading="isUnlinking"
    :disabled="accountCount <= 1"
    @click="unlinkGoogle"
  />
  <UButton
    v-else
    label="Link"
    size="xs"
    :loading="isLinkingGoogle"
    @click="linkGoogle"
  />
</div>
```

**Step 2: Verify settings page**

Navigate to `/settings`. Expected: Google account row with correct status.

**Step 3: Commit**

```bash
git add apps/app/app/pages/settings/index.vue
git commit -m "feat(settings): replace GitHub linked account with Google"
```

---

### Task 4: Install Composio dependencies

**Files:**
- Modify: `apps/app/package.json` (via bun add)

**Step 1: Install packages**

```bash
cd apps/app && bun add @composio/core @ai-sdk/mcp
```

**Step 2: Verify installation**

```bash
cd apps/app && bun run dev
```

Expected: Dev server starts without dependency errors.

**Step 3: Commit**

```bash
git add apps/app/package.json ../../bun.lock
git commit -m "feat(deps): add @composio/core and @ai-sdk/mcp"
```

---

### Task 5: Create Composio types and constants

**Files:**
- Create: `apps/app/server/utils/composio/types.ts`

**Step 1: Create the types file**

```typescript
export const COMPOSIO_TOOLKIT_SLUGS = [
  process.env.COMPOSIO_TOOLKIT_SLUG || 'googlesuper',
]

export const COMPOSIO_KV_KEYS = {
  session: (userId: string) => `composio:session:${userId}`,
} as const

export const COMPOSIO_SESSION_TTL = 60 * 30 // 30 minutes

export interface ComposioSessionCache {
  url: string
  headers: Record<string, string>
  expiresAt: number
}
```

**Step 2: Commit**

```bash
git add apps/app/server/utils/composio/types.ts
git commit -m "feat(composio): add types, constants, and KV key patterns"
```

---

### Task 6: Create Composio session client

**Files:**
- Create: `apps/app/server/utils/composio/client.ts`

**Step 1: Create the client file**

```typescript
import { Composio } from '@composio/core'
import { COMPOSIO_KV_KEYS, COMPOSIO_SESSION_TTL, COMPOSIO_TOOLKIT_SLUGS } from './types'
import type { ComposioSessionCache } from './types'

let composioInstance: Composio | null = null

function getComposio(): Composio {
  if (!composioInstance) {
    const apiKey = process.env.COMPOSIO_PLAYGROUND_API_KEY
    if (!apiKey) throw new Error('COMPOSIO_PLAYGROUND_API_KEY is not set')
    composioInstance = new Composio({ apiKey })
  }
  return composioInstance
}

export async function createComposioSession(userId: string, toolkitSlugs: string[] = COMPOSIO_TOOLKIT_SLUGS) {
  const kv = hubKV()
  const cacheKey = COMPOSIO_KV_KEYS.session(userId)

  const cached = await kv.get<ComposioSessionCache>(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return { mcp: { url: cached.url, headers: cached.headers } }
  }

  const composio = getComposio()
  const session = await composio.create(userId, { toolkits: toolkitSlugs })

  const sessionData: ComposioSessionCache = {
    url: session.mcp.url,
    headers: session.mcp.headers as Record<string, string>,
    expiresAt: Date.now() + COMPOSIO_SESSION_TTL * 1000,
  }
  await kv.set(cacheKey, sessionData, { ttl: COMPOSIO_SESSION_TTL })

  return { mcp: { url: session.mcp.url, headers: session.mcp.headers } }
}
```

Note: `hubKV()` is auto-imported from NuxtHub in `server/utils/` — no import needed.

**Step 2: Commit**

```bash
git add apps/app/server/utils/composio/client.ts
git commit -m "feat(composio): add session factory with KV caching"
```

---

### Task 7: Create Composio tool fetcher

**Files:**
- Create: `apps/app/server/utils/composio/tools.ts`

**Step 1: Create the tools file**

```typescript
import { createMCPClient } from '@ai-sdk/mcp'
import { log } from 'evlog'
import { createComposioSession } from './client'

export async function getComposioTools(userId: string): Promise<Record<string, unknown>> {
  try {
    const session = await createComposioSession(userId)

    const mcpClient = await createMCPClient({
      transport: {
        type: 'http',
        url: session.mcp.url,
        headers: session.mcp.headers,
      },
    })

    const tools = await mcpClient.tools()
    log.info('composio', `Loaded ${Object.keys(tools).length} Composio tools for user ${userId}`)
    return tools
  } catch (error) {
    log.warn('composio', `Failed to load Composio tools for user ${userId}: ${error instanceof Error ? error.message : String(error)}`)
    return {}
  }
}
```

**Step 2: Commit**

```bash
git add apps/app/server/utils/composio/tools.ts
git commit -m "feat(composio): add MCP tool fetcher with graceful degradation"
```

---

### Task 8: Integrate Composio tools into chat endpoint

**Files:**
- Modify: `apps/app/server/api/chats/[id].post.ts`

**Step 1: Add Composio tools to source agent**

In `apps/app/server/api/chats/[id].post.ts`, after the `savoir` creation block (around line 105) and before the `agent` creation (around line 150), add:

```typescript
let composioTools: Record<string, unknown> = {}
if (!isAdminChat) {
  try {
    composioTools = await getComposioTools(user.id)
  } catch {
    // Composio unavailable — continue with sandbox tools only
  }
}
```

Then update the `createSourceAgent` call to merge tools:

Change:
```typescript
tools: savoir.tools,
```

To:
```typescript
tools: { ...savoir.tools, ...composioTools },
```

`getComposioTools` is auto-imported from `server/utils/composio/tools.ts`.

**Step 2: Verify dev server starts and chat endpoint works**

Run: `cd apps/app && bun run dev`
Expected: Server starts. Chat endpoint still works (Composio tools merged alongside sandbox tools).

**Step 3: Commit**

```bash
git add apps/app/server/api/chats/[id].post.ts
git commit -m "feat(chat): merge Composio Google tools into source agent"
```

---

### Task 9: Update system prompt with Google tools section

**Files:**
- Modify: `packages/agent/src/prompts/chat.ts`

**Step 1: Add Google tools section to BASE_SYSTEM_PROMPT**

In `packages/agent/src/prompts/chat.ts`, append the following to `BASE_SYSTEM_PROMPT` (before the closing backtick, after the "Response Style" section):

```

## Google Tools

You have access to Google tools (Gmail, Calendar, Drive, etc.) that operate on the user's connected Google account.
- Use these tools when the user asks about their emails, calendar events, documents, etc.
- If a Google tool returns an authentication error, tell the user they need to connect their Google account in Settings > Connections.
- Always search sandbox documentation FIRST. Only use Google tools for personal data queries.
```

**Step 2: Commit**

```bash
git add packages/agent/src/prompts/chat.ts
git commit -m "feat(prompts): add Google tools section to system prompt"
```

---

### Task 10: Create Google connection status API

**Files:**
- Create: `apps/app/server/api/connections/google.get.ts`

**Step 1: Create the endpoint**

```typescript
import { Composio } from '@composio/core'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const apiKey = process.env.COMPOSIO_PLAYGROUND_API_KEY
  if (!apiKey) {
    return { connected: false }
  }

  try {
    const composio = new Composio({ apiKey })
    const session = await composio.create(user.id, {
      toolkits: [process.env.COMPOSIO_TOOLKIT_SLUG || 'googlesuper'],
    })
    // If session creates without requiring auth, the user is connected
    const tools = await session.tools()
    return { connected: Object.keys(tools).length > 0 }
  } catch {
    return { connected: false }
  }
})
```

**Step 2: Commit**

```bash
git add apps/app/server/api/connections/google.get.ts
git commit -m "feat(api): add Google connection status endpoint"
```

---

### Task 11: Create Google connection initiation API

**Files:**
- Create: `apps/app/server/api/connections/google.post.ts`

**Step 1: Create the endpoint**

```typescript
import { Composio } from '@composio/core'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const apiKey = process.env.COMPOSIO_PLAYGROUND_API_KEY
  if (!apiKey) {
    throw createError({ statusCode: 500, statusMessage: 'Composio not configured' })
  }

  try {
    const composio = new Composio({ apiKey })
    const session = await composio.create(user.id, {
      toolkits: [process.env.COMPOSIO_TOOLKIT_SLUG || 'googlesuper'],
    })

    const connectUrl = session.mcp.url.replace('/mcp', '/connect')
    return { connectUrl }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to initiate Google connection',
      data: { why: error instanceof Error ? error.message : 'Unknown error' },
    })
  }
})
```

Note: The exact connect URL pattern may need adjustment once we test with Composio's API — the `session.authorize()` or Connect Link generation method should be verified against Composio docs during implementation.

**Step 2: Commit**

```bash
git add apps/app/server/api/connections/google.post.ts
git commit -m "feat(api): add Google connection initiation endpoint"
```

---

### Task 12: Create Google disconnection API

**Files:**
- Create: `apps/app/server/api/connections/google.delete.ts`

**Step 1: Create the endpoint**

```typescript
import { Composio } from '@composio/core'
import { COMPOSIO_KV_KEYS } from '../../utils/composio/types'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const apiKey = process.env.COMPOSIO_PLAYGROUND_API_KEY
  if (!apiKey) {
    throw createError({ statusCode: 500, statusMessage: 'Composio not configured' })
  }

  try {
    const kv = hubKV()
    await kv.del(COMPOSIO_KV_KEYS.session(user.id))

    return { success: true }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to disconnect Google',
      data: { why: error instanceof Error ? error.message : 'Unknown error' },
    })
  }
})
```

**Step 2: Commit**

```bash
git add apps/app/server/api/connections/google.delete.ts
git commit -m "feat(api): add Google disconnection endpoint"
```

---

### Task 13: Create connections settings page

**Files:**
- Create: `apps/app/app/pages/settings/connections.vue`

**Step 1: Create the page**

```vue
<script setup lang="ts">
definePageMeta({ auth: 'user' })

useSeoMeta({ title: 'Connections' })

const toast = useToast()
const { showError } = useErrorToast()

const { data: googleStatus, refresh, status } = useLazyAsyncData(
  'google-connection',
  () => $fetch('/api/connections/google'),
  { server: false },
)

const isConnecting = ref(false)
const isDisconnecting = ref(false)

const isConnected = computed(() => googleStatus.value?.connected ?? false)

async function connectGoogle() {
  isConnecting.value = true
  try {
    const { connectUrl } = await $fetch('/api/connections/google', { method: 'POST' })
    window.open(connectUrl, '_blank')
    toast.add({ title: 'Complete the connection in the new tab', icon: 'i-lucide-external-link' })
  } catch (e) {
    showError(e, { fallback: 'Failed to start Google connection' })
  } finally {
    isConnecting.value = false
  }
}

async function disconnectGoogle() {
  isDisconnecting.value = true
  try {
    await $fetch('/api/connections/google', { method: 'DELETE' })
    await refresh()
    toast.add({ title: 'Google disconnected', icon: 'i-lucide-check' })
  } catch (e) {
    showError(e, { fallback: 'Failed to disconnect Google' })
  } finally {
    isDisconnecting.value = false
  }
}
</script>

<template>
  <div class="px-6 py-8 max-w-2xl mx-auto w-full">
    <header class="mb-8">
      <div class="flex items-center gap-2 mb-3">
        <NuxtLink to="/settings" class="text-muted hover:text-highlighted transition-colors">
          <UIcon name="i-lucide-arrow-left" class="size-4" />
        </NuxtLink>
        <h1 class="text-lg font-medium text-highlighted font-pixel tracking-wide">
          Connections
        </h1>
      </div>
      <p class="text-sm text-muted max-w-lg">
        Manage your connected services for AI-powered tools.
      </p>
    </header>

    <div class="space-y-8">
      <section>
        <h2 class="text-[10px] text-muted uppercase tracking-wide mb-3 font-pixel">
          Services
        </h2>
        <div class="rounded-lg border border-default divide-y divide-default">
          <div v-if="status === 'pending'" class="flex items-center justify-between px-4 py-3.5">
            <div>
              <USkeleton class="h-4 w-28 mb-1" />
              <USkeleton class="h-3 w-48" />
            </div>
            <USkeleton class="h-8 w-20 rounded-md" />
          </div>
          <div v-else class="flex items-center justify-between gap-4 px-4 py-3">
            <div class="flex items-center gap-3">
              <UIcon name="i-simple-icons-google" class="size-5 text-highlighted" />
              <div>
                <p class="text-sm text-highlighted">
                  Google
                </p>
                <p class="text-xs text-muted">
                  {{ isConnected ? 'Connected — Gmail, Calendar, Drive tools available in chat' : 'Not connected' }}
                </p>
              </div>
            </div>
            <UButton
              v-if="isConnected"
              label="Disconnect"
              color="neutral"
              variant="ghost"
              size="xs"
              :loading="isDisconnecting"
              @click="disconnectGoogle"
            />
            <UButton
              v-else
              label="Connect"
              size="xs"
              :loading="isConnecting"
              @click="connectGoogle"
            />
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
```

**Step 2: Verify the page renders**

Navigate to `/settings/connections`. Expected: Google connection card with status and action button.

**Step 3: Commit**

```bash
git add apps/app/app/pages/settings/connections.vue
git commit -m "feat(settings): add connections page for Google service management"
```

---

### Task 14: Add Connections link to settings index

**Files:**
- Modify: `apps/app/app/pages/settings/index.vue`

**Step 1: Add Connections link**

In `apps/app/app/pages/settings/index.vue`, add a new section before the "Developer" section (before the `<section>` that contains the API Keys link). Insert:

```html
<section>
  <h2 class="text-[10px] text-muted uppercase tracking-wide mb-3 font-pixel">
    Services
  </h2>
  <div class="rounded-lg border border-default divide-y divide-default">
    <NuxtLink to="/settings/connections" class="flex items-center justify-between gap-4 px-4 py-3 hover:bg-elevated/50 transition-colors">
      <div class="flex items-center gap-3">
        <UIcon name="i-lucide-plug" class="size-5 text-highlighted" />
        <div>
          <p class="text-sm text-highlighted">
            Connections
          </p>
          <p class="text-xs text-muted">
            Connect Google and other services for AI access.
          </p>
        </div>
      </div>
      <UIcon name="i-lucide-chevron-right" class="size-4 text-muted" />
    </NuxtLink>
  </div>
</section>
```

**Step 2: Verify settings page**

Navigate to `/settings`. Expected: New "Services" section with Connections link visible above "Developer".

**Step 3: Commit**

```bash
git add apps/app/app/pages/settings/index.vue
git commit -m "feat(settings): add Connections link to settings index"
```

---

### Task 15: Update .env.example with Composio variables

**Files:**
- Modify: `apps/app/.env.example`

**Step 1: Add Composio section**

Append after the Storage section in `apps/app/.env.example`:

```

# --- Composio (Google tools, optional) --------------------------------------

# COMPOSIO_PLAYGROUND_API_KEY=  # Composio API key for Google toolkit integration
# COMPOSIO_TOOLKIT_SLUG=googlesuper
```

**Step 2: Commit**

```bash
git add apps/app/.env.example
git commit -m "docs(env): add Composio environment variables to .env.example"
```

---

### Task 16: Smoke test full flow

**Step 1: Start dev server**

```bash
cd apps/app && bun run dev
```

**Step 2: Verify login page**

Navigate to `/login`. Expected: Google sign-in button, no GitHub button.

**Step 3: Verify settings**

Navigate to `/settings`. Expected: Google in "Connected accounts", "Services > Connections" link.

**Step 4: Verify connections page**

Navigate to `/settings/connections`. Expected: Google card with connect/disconnect button.

**Step 5: Verify chat still works**

Open a chat and send a message. Expected: Agent responds (sandbox tools still work). If Composio env vars are set, Google tools should also be available.

**Step 6: Run lint**

```bash
bun run lint:fix
```

Fix any issues.

**Step 7: Run typecheck**

```bash
bun run typecheck
```

Fix any type errors.

**Step 8: Final commit (if lint/typecheck fixes needed)**

```bash
git add -A
git commit -m "fix: lint and type fixes for Composio integration"
```
