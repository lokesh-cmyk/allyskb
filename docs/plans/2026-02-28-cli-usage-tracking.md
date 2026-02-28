# Claude Code CLI Usage Tracking — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Track per-developer Claude Code CLI usage (sessions, tokens, costs) via a Stop hook and display it in the admin dashboard.

**Architecture:** A Claude Code `Stop` hook sends session stats to a new `POST /api/cli-usage` endpoint (authenticated via existing Better Auth API keys). Data is stored in a new `cliUsage` table and displayed on a new "CLI Usage" tab on the admin stats page. A setup script automates developer onboarding.

**Tech Stack:** Nuxt 4, Drizzle ORM (PostgreSQL), Better Auth API keys, Zod validation, Bash (hook script)

---

### Task 1: Add `cliUsage` table to database schema

**Files:**
- Modify: `apps/app/server/db/schema.ts:124` (after `invitations` table)

**Step 1: Add the cliUsage table definition**

Add after the `invitations` table (line 124) in `apps/app/server/db/schema.ts`:

```typescript
export const cliUsage = pgTable('cli_usage', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  sessionId: text('session_id').notNull(),
  project: text('project'),
  model: text('model'),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  turns: integer('turns').notNull().default(0),
  toolCalls: integer('tool_calls').notNull().default(0),
  durationMs: integer('duration_ms'),
  startedAt: timestamp('started_at'),
  lastActiveAt: timestamp('last_active_at'),
  metadata: jsonb('metadata'),
  ...timestamps,
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, table => [
  uniqueIndex('cli_usage_session_id_idx').on(table.sessionId),
  index('cli_usage_user_id_idx').on(table.userId),
  index('cli_usage_created_at_idx').on(table.createdAt),
])
```

**Step 2: Generate the database migration**

Run from `apps/app/`:
```bash
cd apps/app && bun run db:generate
```

Expected: A new migration file in `apps/app/server/db/migrations/postgresql/` creating the `cli_usage` table.

**Step 3: Apply the migration**

```bash
cd apps/app && bun run db:migrate
```

Expected: Migration applied successfully.

**Step 4: Commit**

```bash
git add apps/app/server/db/schema.ts apps/app/server/db/migrations/
git commit -m "feat: add cliUsage table for Claude Code CLI tracking"
```

---

### Task 2: Add CLI usage type definitions

**Files:**
- Modify: `apps/app/shared/types/stats.d.ts` (append new types)

**Step 1: Add CLI usage types**

Append to `apps/app/shared/types/stats.d.ts`:

```typescript
export interface CliUsageRecord {
  id: string
  userId: string
  sessionId: string
  project: string | null
  model: string | null
  inputTokens: number
  outputTokens: number
  turns: number
  toolCalls: number
  durationMs: number | null
  startedAt: string | null
  lastActiveAt: string | null
  metadata: Record<string, unknown> | null
}

export interface CliUserStats {
  userId: string
  name: string
  email: string
  image: string | null
  sessions: number
  turns: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCost: number
  lastActiveAt: string | null
}

export interface CliDailyStats {
  date: string
  sessions: number
  inputTokens: number
  outputTokens: number
  turns: number
}

export interface CliUsageResponse {
  period: { days: number, from: string, to: string }
  totals: {
    sessions: number
    turns: number
    inputTokens: number
    outputTokens: number
    totalTokens: number
    activeUsers: number
    estimatedCost: number
  }
  byUser: CliUserStats[]
  daily: CliDailyStats[]
  byModel: Array<{ model: string, sessions: number, inputTokens: number, outputTokens: number, totalCost: number }>
}
```

**Step 2: Commit**

```bash
git add apps/app/shared/types/stats.d.ts
git commit -m "feat: add CLI usage type definitions"
```

---

### Task 3: Create POST /api/cli-usage endpoint

**Files:**
- Create: `apps/app/server/api/cli-usage.post.ts`

**Step 1: Write the upsert endpoint**

Create `apps/app/server/api/cli-usage.post.ts`:

```typescript
import { z } from 'zod'
import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

const bodySchema = z.object({
  sessionId: z.string().min(1).max(200),
  project: z.string().max(200).nullish(),
  model: z.string().max(100).nullish(),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  turns: z.number().int().nonnegative().default(0),
  toolCalls: z.number().int().nonnegative().default(0),
  durationMs: z.number().int().nonnegative().nullish(),
  startedAt: z.string().nullish(),
  lastActiveAt: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const body = await readValidatedBody(event, bodySchema.parse)

  const existing = await db
    .select({ id: schema.cliUsage.id })
    .from(schema.cliUsage)
    .where(eq(schema.cliUsage.sessionId, body.sessionId))
    .limit(1)

  if (existing.length > 0) {
    await db.update(schema.cliUsage).set({
      model: body.model ?? undefined,
      inputTokens: body.inputTokens,
      outputTokens: body.outputTokens,
      turns: body.turns,
      toolCalls: body.toolCalls,
      durationMs: body.durationMs ?? undefined,
      lastActiveAt: body.lastActiveAt ? new Date(body.lastActiveAt) : new Date(),
      metadata: body.metadata ?? undefined,
      updatedAt: new Date(),
    }).where(eq(schema.cliUsage.id, existing[0]!.id))

    return { ok: true, action: 'updated' }
  }

  await db.insert(schema.cliUsage).values({
    userId: user.id,
    sessionId: body.sessionId,
    project: body.project ?? undefined,
    model: body.model ?? undefined,
    inputTokens: body.inputTokens,
    outputTokens: body.outputTokens,
    turns: body.turns,
    toolCalls: body.toolCalls,
    durationMs: body.durationMs ?? undefined,
    startedAt: body.startedAt ? new Date(body.startedAt) : new Date(),
    lastActiveAt: body.lastActiveAt ? new Date(body.lastActiveAt) : new Date(),
    metadata: body.metadata ?? undefined,
  })

  return { ok: true, action: 'created' }
})
```

**Step 2: Verify the endpoint compiles**

```bash
cd apps/app && bun run typecheck
```

Expected: No type errors.

**Step 3: Commit**

```bash
git add apps/app/server/api/cli-usage.post.ts
git commit -m "feat: add POST /api/cli-usage endpoint for CLI tracking"
```

---

### Task 4: Create GET /api/admin/cli-usage endpoint

**Files:**
- Create: `apps/app/server/api/admin/cli-usage.get.ts`

**Step 1: Write the admin CLI usage stats endpoint**

Create `apps/app/server/api/admin/cli-usage.get.ts`:

```typescript
import { db, schema } from '@nuxthub/db'
import { and, count, desc, eq, gte, sql, sum } from 'drizzle-orm'
import type { CliUsageResponse } from '#shared/types/stats'

export default defineEventHandler(async (event): Promise<CliUsageResponse> => {
  await requireAdmin(event)

  const query = getQuery(event)
  const days = Math.min(Math.max(Number(query.days) || 30, 1), 365)
  const userId = query.userId as string | undefined

  const from = new Date()
  from.setDate(from.getDate() - days)
  from.setHours(0, 0, 0, 0)

  const to = new Date()
  to.setHours(23, 59, 59, 999)

  const conditions = [gte(schema.cliUsage.createdAt, from)]
  if (userId) conditions.push(eq(schema.cliUsage.userId, userId))

  // Fetch all CLI usage records in the period
  const records = await db
    .select()
    .from(schema.cliUsage)
    .where(and(...conditions))
    .orderBy(desc(schema.cliUsage.lastActiveAt))

  // Fetch user info for all userIds
  const userIds = [...new Set(records.map(r => r.userId))]
  const users = userIds.length > 0
    ? await db.select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        image: schema.user.image,
      }).from(schema.user).where(
        sql`${schema.user.id} IN ${userIds}`,
      )
    : []
  const userMap = new Map(users.map(u => [u.id, u]))

  // Aggregate by user
  const byUserMap = new Map<string, {
    sessions: number
    turns: number
    inputTokens: number
    outputTokens: number
    lastActiveAt: Date | null
    models: Set<string>
  }>()

  for (const r of records) {
    const existing = byUserMap.get(r.userId) ?? {
      sessions: 0, turns: 0, inputTokens: 0, outputTokens: 0,
      lastActiveAt: null, models: new Set<string>(),
    }
    existing.sessions++
    existing.turns += r.turns
    existing.inputTokens += r.inputTokens
    existing.outputTokens += r.outputTokens
    if (r.model) existing.models.add(r.model)
    if (!existing.lastActiveAt || (r.lastActiveAt && r.lastActiveAt > existing.lastActiveAt)) {
      existing.lastActiveAt = r.lastActiveAt
    }
    byUserMap.set(r.userId, existing)
  }

  // Get pricing for cost estimation
  const pricingMap = await getModelPricingMap()

  // Aggregate by model
  const byModelMap = new Map<string, { sessions: number, inputTokens: number, outputTokens: number }>()
  for (const r of records) {
    const model = r.model || 'unknown'
    const existing = byModelMap.get(model) ?? { sessions: 0, inputTokens: 0, outputTokens: 0 }
    existing.sessions++
    existing.inputTokens += r.inputTokens
    existing.outputTokens += r.outputTokens
    byModelMap.set(model, existing)
  }

  // Aggregate daily
  const dailyMap = new Map<string, { sessions: number, inputTokens: number, outputTokens: number, turns: number }>()
  for (const r of records) {
    const date = (r.startedAt ?? r.createdAt).toISOString().slice(0, 10)
    const existing = dailyMap.get(date) ?? { sessions: 0, inputTokens: 0, outputTokens: 0, turns: 0 }
    existing.sessions++
    existing.inputTokens += r.inputTokens
    existing.outputTokens += r.outputTokens
    existing.turns += r.turns
    dailyMap.set(date, existing)
  }

  // Zero-fill daily data
  const daily = []
  const cursor = new Date(from)
  while (cursor <= to) {
    const dateStr = cursor.toISOString().slice(0, 10)
    const d = dailyMap.get(dateStr)
    daily.push({
      date: dateStr,
      sessions: d?.sessions ?? 0,
      inputTokens: d?.inputTokens ?? 0,
      outputTokens: d?.outputTokens ?? 0,
      turns: d?.turns ?? 0,
    })
    cursor.setDate(cursor.getDate() + 1)
  }

  // Compute totals
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalTurns = 0
  let totalEstimatedCost = 0
  for (const r of records) {
    totalInputTokens += r.inputTokens
    totalOutputTokens += r.outputTokens
    totalTurns += r.turns
  }

  // Compute costs
  const byModel = Array.from(byModelMap.entries()).map(([model, data]) => {
    const pricing = pricingMap[model]
    const totalCost = pricing
      ? (data.inputTokens * pricing.input) + (data.outputTokens * pricing.output)
      : 0
    totalEstimatedCost += totalCost
    return { model, sessions: data.sessions, inputTokens: data.inputTokens, outputTokens: data.outputTokens, totalCost }
  }).sort((a, b) => b.inputTokens + b.outputTokens - a.inputTokens - a.outputTokens)

  // Build per-user stats with costs
  const byUser = Array.from(byUserMap.entries()).map(([uid, data]) => {
    const u = userMap.get(uid)
    let userCost = 0
    // Estimate per-user cost by proportion of total tokens
    const userTotalTokens = data.inputTokens + data.outputTokens
    const grandTotal = totalInputTokens + totalOutputTokens
    if (grandTotal > 0 && totalEstimatedCost > 0) {
      userCost = (userTotalTokens / grandTotal) * totalEstimatedCost
    }
    return {
      userId: uid,
      name: u?.name ?? 'Unknown',
      email: u?.email ?? '',
      image: u?.image ?? null,
      sessions: data.sessions,
      turns: data.turns,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      totalTokens: data.inputTokens + data.outputTokens,
      estimatedCost: userCost,
      lastActiveAt: data.lastActiveAt?.toISOString() ?? null,
    }
  }).sort((a, b) => b.totalTokens - a.totalTokens)

  return {
    period: { days, from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
    totals: {
      sessions: records.length,
      turns: totalTurns,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      activeUsers: byUserMap.size,
      estimatedCost: totalEstimatedCost,
    },
    byUser,
    daily,
    byModel,
  }
})
```

**Step 2: Verify typecheck**

```bash
cd apps/app && bun run typecheck
```

Expected: No type errors.

**Step 3: Commit**

```bash
git add apps/app/server/api/admin/cli-usage.get.ts
git commit -m "feat: add GET /api/admin/cli-usage endpoint for admin dashboard"
```

---

### Task 5: Add CLI Usage tab to admin stats page

**Files:**
- Modify: `apps/app/app/pages/admin/stats.vue`

**Step 1: Add the CLI Usage tab state and data fetch**

In the `<script setup>` section of `apps/app/app/pages/admin/stats.vue`, add after line 13 (`chartMetric` ref):

```typescript
const activeTab = ref<'app' | 'cli'>('app')

const { data: cliStats, refresh: refreshCli, status: cliStatus } = useLazyFetch<CliUsageResponse>('/api/admin/cli-usage', {
  query: computed(() => ({ days: selectedPeriod.value })),
  watch: [selectedPeriod],
  immediate: false,
})

watch(activeTab, (tab) => {
  if (tab === 'cli' && !cliStats.value) refreshCli()
})
```

**Step 2: Add tab switcher to the template header**

In the template, after the period buttons div (line 220), add a tab switcher. Replace the period buttons section (lines 207-220) with:

```html
        <div class="flex items-center gap-6">
          <div class="flex items-center gap-1 border border-default rounded-lg p-0.5">
            <UButton
              size="xs"
              :color="activeTab === 'app' ? 'primary' : 'neutral'"
              :variant="activeTab === 'app' ? 'solid' : 'ghost'"
              @click="activeTab = 'app'"
            >
              App Usage
            </UButton>
            <UButton
              size="xs"
              :color="activeTab === 'cli' ? 'primary' : 'neutral'"
              :variant="activeTab === 'cli' ? 'solid' : 'ghost'"
              @click="activeTab = 'cli'"
            >
              CLI Usage
            </UButton>
          </div>
          <div class="flex items-center gap-1">
            <UButton
              v-for="option in periodOptions"
              :key="option.value"
              size="xs"
              :color="selectedPeriod === option.value ? 'primary' : 'neutral'"
              :variant="selectedPeriod === option.value ? 'solid' : 'ghost'"
              :disabled="isRefreshing"
              @click="selectedPeriod = option.value"
            >
              {{ option.label }}
            </UButton>
          </div>
          <UTooltip text="Refresh data">
            <UButton
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="ghost"
              size="xs"
              :loading="isRefreshing"
              @click="activeTab === 'cli' ? refreshCli() : refresh()"
            />
          </UTooltip>
        </div>
```

**Step 3: Add CLI Usage template section**

Wrap the existing stats content (the `<template v-else-if="stats">` block) in `v-if="activeTab === 'app'"`, and add a new `v-else-if="activeTab === 'cli'"` block after it. Insert before the final empty-state `<div v-else>` block (line 630):

```html
    <template v-else-if="activeTab === 'cli'">
      <div v-if="cliStatus === 'pending' && !cliStats">
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <div v-for="i in 6" :key="i" class="rounded-lg border border-default bg-elevated/50 p-4">
            <USkeleton class="h-3 w-16 mb-2" />
            <USkeleton class="h-7 w-12 mb-1" />
          </div>
        </div>
        <USkeleton class="h-56 w-full rounded-lg" />
      </div>

      <template v-else-if="cliStats">
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <div class="rounded-lg border border-default bg-elevated/50 p-4">
            <p class="text-xs text-muted mb-1">Sessions</p>
            <p class="text-2xl font-semibold text-highlighted tabular-nums">
              {{ formatNumber(cliStats.totals.sessions) }}
            </p>
          </div>
          <div class="rounded-lg border border-default bg-elevated/50 p-4">
            <p class="text-xs text-muted mb-1">Turns</p>
            <p class="text-2xl font-semibold text-highlighted tabular-nums">
              {{ formatNumber(cliStats.totals.turns) }}
            </p>
          </div>
          <div class="rounded-lg border border-default bg-elevated/50 p-4">
            <p class="text-xs text-muted mb-1">Total Tokens</p>
            <p class="text-2xl font-semibold text-highlighted tabular-nums">
              {{ formatCompactNumber(cliStats.totals.totalTokens) }}
            </p>
          </div>
          <div class="rounded-lg border border-default bg-elevated/50 p-4">
            <p class="text-xs text-muted mb-1">Active Users</p>
            <p class="text-2xl font-semibold text-highlighted tabular-nums">
              {{ cliStats.totals.activeUsers }}
            </p>
          </div>
          <div class="rounded-lg border border-default bg-elevated/50 p-4">
            <p class="text-xs text-muted mb-1">Est. Cost</p>
            <p class="text-2xl font-semibold text-highlighted tabular-nums">
              {{ formatCost(cliStats.totals.estimatedCost) }}
            </p>
          </div>
          <div class="rounded-lg border border-default bg-elevated/50 p-4">
            <p class="text-xs text-muted mb-1">Avg Turns/Session</p>
            <p class="text-2xl font-semibold text-highlighted tabular-nums">
              {{ cliStats.totals.sessions > 0 ? Math.round(cliStats.totals.turns / cliStats.totals.sessions) : 0 }}
            </p>
          </div>
        </div>

        <!-- Daily CLI usage chart -->
        <section class="mb-10">
          <h2 class="text-sm font-medium text-highlighted mb-3">CLI Usage Over Time</h2>
          <div v-if="cliStats.daily.some(d => d.sessions > 0)" class="rounded-lg border border-default bg-elevated/50 p-4 overflow-hidden">
            <div class="h-40 flex items-end gap-0.5 px-4">
              <div
                v-for="(day, index) in cliStats.daily"
                :key="index"
                class="flex-1 group"
              >
                <UTooltip
                  :text="`${day.date} — ${day.sessions} sessions, ${formatCompactNumber(day.inputTokens + day.outputTokens)} tokens`"
                  :content="{ side: 'top', sideOffset: 6 }"
                >
                  <div
                    class="w-full bg-primary-500 rounded-t-sm transition-opacity group-hover:opacity-80 relative before:absolute before:inset-x-0 before:bottom-full before:h-40"
                    :style="{ height: `${Math.max(1, (day.sessions / Math.max(...cliStats.daily.map(d => d.sessions), 1)) * 140)}px` }"
                  />
                </UTooltip>
              </div>
            </div>
          </div>
          <div v-else class="rounded-lg border border-dashed border-default p-6 text-center">
            <p class="text-sm text-muted">No CLI usage data in this period</p>
          </div>
        </section>

        <!-- Per-user table -->
        <section class="mb-10">
          <h2 class="text-xs text-highlighted mb-3 font-pixel tracking-wide uppercase">Usage By Developer</h2>
          <div v-if="cliStats.byUser.length > 0" class="rounded-lg border border-default overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-elevated/50">
                <tr class="border-b border-default text-xs text-muted">
                  <th class="text-left font-medium px-4 py-2.5">Developer</th>
                  <th class="text-right font-medium px-3 py-2.5">Sessions</th>
                  <th class="text-right font-medium px-3 py-2.5">Turns</th>
                  <th class="text-right font-medium px-3 py-2.5">Tokens</th>
                  <th class="text-right font-medium px-3 py-2.5">Est. Cost</th>
                  <th class="text-right font-medium px-4 py-2.5">Last Active</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-default">
                <tr v-for="dev in cliStats.byUser" :key="dev.userId" class="hover:bg-elevated/30">
                  <td class="px-4 py-2">
                    <div class="flex items-center gap-2">
                      <img v-if="dev.image" :src="dev.image" :alt="dev.name" class="size-6 rounded-full">
                      <div v-else class="size-6 rounded-full bg-muted/20 flex items-center justify-center">
                        <UIcon name="i-lucide-user" class="size-3 text-muted" />
                      </div>
                      <div class="min-w-0">
                        <p class="text-highlighted truncate text-xs">{{ dev.name }}</p>
                        <p class="text-[10px] text-muted truncate">{{ dev.email }}</p>
                      </div>
                    </div>
                  </td>
                  <td class="text-right text-muted tabular-nums px-3 py-2.5 text-xs">{{ formatNumber(dev.sessions) }}</td>
                  <td class="text-right text-muted tabular-nums px-3 py-2.5 text-xs">{{ formatNumber(dev.turns) }}</td>
                  <td class="text-right text-muted tabular-nums px-3 py-2.5 text-xs">{{ formatCompactNumber(dev.totalTokens) }}</td>
                  <td class="text-right text-muted tabular-nums px-3 py-2.5 text-xs">{{ formatCost(dev.estimatedCost) }}</td>
                  <td class="text-right text-muted tabular-nums px-4 py-2.5 text-xs">
                    {{ dev.lastActiveAt ? new Date(dev.lastActiveAt).toLocaleDateString() : '—' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="rounded-lg border border-dashed border-default p-6 text-center">
            <p class="text-sm text-muted">No CLI usage data yet</p>
          </div>
        </section>

        <!-- By Model -->
        <section v-if="cliStats.byModel.length > 0">
          <h2 class="text-xs text-highlighted mb-3 font-pixel tracking-wide uppercase">By Model</h2>
          <div class="rounded-lg border border-default overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-elevated/50">
                <tr class="border-b border-default text-xs text-muted">
                  <th class="text-left font-medium px-4 py-2.5">Model</th>
                  <th class="text-right font-medium px-3 py-2.5">Sessions</th>
                  <th class="text-right font-medium px-3 py-2.5">Tokens</th>
                  <th class="text-right font-medium px-4 py-2.5">Cost</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-default">
                <tr v-for="m in cliStats.byModel" :key="m.model" class="hover:bg-elevated/30">
                  <td class="px-4 py-2.5">
                    <span class="text-highlighted">{{ formatModelName(m.model) }}</span>
                    <span class="text-xs text-muted block truncate max-w-64">{{ m.model }}</span>
                  </td>
                  <td class="text-right text-muted tabular-nums px-3 py-2.5">{{ formatNumber(m.sessions) }}</td>
                  <td class="text-right text-muted tabular-nums px-3 py-2.5">{{ formatCompactNumber(m.inputTokens + m.outputTokens) }}</td>
                  <td class="text-right text-muted tabular-nums px-4 py-2.5">{{ m.totalCost > 0 ? formatCost(m.totalCost) : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>

      <div v-else class="flex flex-col items-center py-16 border border-dashed border-default rounded-lg">
        <div class="size-10 rounded-lg bg-elevated flex items-center justify-center mb-4">
          <UIcon name="i-lucide-terminal" class="size-5 text-muted" aria-hidden="true" />
        </div>
        <p class="text-sm font-medium text-highlighted mb-1">No CLI usage data</p>
        <p class="text-xs text-muted text-center max-w-xs">
          Set up the CLI tracker hook to start collecting usage data from developers.
        </p>
      </div>
    </template>
```

**Step 4: Adjust existing content to respect activeTab**

Wrap the existing app stats content:
- The `<div v-if="status === 'pending' && !stats">` skeleton block: add `&& activeTab === 'app'` condition
- The `<template v-else-if="stats">` block: change to `<template v-else-if="stats && activeTab === 'app'">`
- The final empty `<div v-else>` block: change to `<div v-else-if="activeTab === 'app'">`

**Step 5: Verify the dev server loads without errors**

```bash
cd /d/web_applications/allys_kb/knowledge-agent && bun run dev:app
```

Expected: Page loads, tab switcher renders, CLI tab shows loading/empty state.

**Step 6: Commit**

```bash
git add apps/app/app/pages/admin/stats.vue
git commit -m "feat: add CLI Usage tab to admin stats dashboard"
```

---

### Task 6: Create the CLI tracker hook script

**Files:**
- Create: `apps/app/scripts/cli-tracker-hook.sh`

**Step 1: Write the hook script**

Create `apps/app/scripts/cli-tracker-hook.sh`:

```bash
#!/usr/bin/env bash
# Claude Code CLI Usage Tracker Hook
# Fires on Stop events, reads session data, pushes to admin dashboard.
# Install via: cli-tracker-setup.sh

set -euo pipefail

CONFIG_DIR="${CLAUDE_HOME:-$HOME/.claude}"
TOKEN_FILE="$CONFIG_DIR/cli-tracker-token"
URL_FILE="$CONFIG_DIR/cli-tracker-url"
BUFFER_DIR="$CONFIG_DIR/usage-buffer"

# Read hook input from stdin
INPUT=$(cat)

# Extract session info from hook input
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || true)
CWD=$(echo "$INPUT" | jq -r '.cwd // empty' 2>/dev/null || true)

if [ -z "$SESSION_ID" ]; then
  exit 0
fi

# Read config
if [ ! -f "$TOKEN_FILE" ] || [ ! -f "$URL_FILE" ]; then
  exit 0
fi

API_TOKEN=$(cat "$TOKEN_FILE")
APP_URL=$(cat "$URL_FILE")

if [ -z "$API_TOKEN" ] || [ -z "$APP_URL" ]; then
  exit 0
fi

# Extract project name from CWD
PROJECT=""
if [ -n "$CWD" ]; then
  PROJECT=$(basename "$CWD")
fi

# Locate session file
ENCODED_CWD=$(echo "$CWD" | sed 's|/|%2F|g; s|:|%3A|g; s| |%20|g')
# Try common session file locations
SESSION_FILE=""
for pattern in \
  "$CONFIG_DIR/projects/$ENCODED_CWD/sessions/$SESSION_ID.jsonl" \
  "$CONFIG_DIR/projects/${ENCODED_CWD}/sessions/${SESSION_ID}.jsonl"; do
  if [ -f "$pattern" ]; then
    SESSION_FILE="$pattern"
    break
  fi
done

# Parse session data
INPUT_TOKENS=0
OUTPUT_TOKENS=0
TURNS=0
TOOL_CALLS=0
MODEL=""
STARTED_AT=""

if [ -n "$SESSION_FILE" ] && [ -f "$SESSION_FILE" ]; then
  # Extract stats from JSONL session file
  STATS=$(jq -s '
    {
      inputTokens: [.[] | select(.type == "assistant") | .usage.input_tokens // 0] | add // 0,
      outputTokens: [.[] | select(.type == "assistant") | .usage.output_tokens // 0] | add // 0,
      turns: [.[] | select(.type == "user_message" or .type == "human")] | length,
      toolCalls: [.[] | select(.type == "tool_result" or .type == "tool_use")] | length,
      model: ([.[] | select(.type == "assistant" and .model != null) | .model] | last // ""),
      startedAt: ([.[] | select(.timestamp != null) | .timestamp] | first // "")
    }
  ' "$SESSION_FILE" 2>/dev/null || echo '{}')

  INPUT_TOKENS=$(echo "$STATS" | jq -r '.inputTokens // 0')
  OUTPUT_TOKENS=$(echo "$STATS" | jq -r '.outputTokens // 0')
  TURNS=$(echo "$STATS" | jq -r '.turns // 0')
  TOOL_CALLS=$(echo "$STATS" | jq -r '.toolCalls // 0')
  MODEL=$(echo "$STATS" | jq -r '.model // ""')
  STARTED_AT=$(echo "$STATS" | jq -r '.startedAt // ""')
fi

LAST_ACTIVE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
GIT_BRANCH=$(cd "$CWD" 2>/dev/null && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

# Build payload
PAYLOAD=$(jq -n \
  --arg sessionId "$SESSION_ID" \
  --arg project "$PROJECT" \
  --arg model "$MODEL" \
  --argjson inputTokens "$INPUT_TOKENS" \
  --argjson outputTokens "$OUTPUT_TOKENS" \
  --argjson turns "$TURNS" \
  --argjson toolCalls "$TOOL_CALLS" \
  --arg startedAt "$STARTED_AT" \
  --arg lastActiveAt "$LAST_ACTIVE" \
  --arg gitBranch "$GIT_BRANCH" \
  '{
    sessionId: $sessionId,
    project: $project,
    model: (if $model == "" then null else $model end),
    inputTokens: $inputTokens,
    outputTokens: $outputTokens,
    turns: $turns,
    toolCalls: $toolCalls,
    startedAt: (if $startedAt == "" then null else $startedAt end),
    lastActiveAt: $lastActiveAt,
    metadata: { gitBranch: (if $gitBranch == "" then null else $gitBranch end) }
  }')

# Try to send
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$APP_URL/api/cli-usage" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_TOKEN" \
  -d "$PAYLOAD" \
  --connect-timeout 5 \
  --max-time 8 \
  2>/dev/null || echo -e "\n000")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
  # Success — sync any buffered entries
  if [ -d "$BUFFER_DIR" ]; then
    for buf_file in "$BUFFER_DIR"/*.json; do
      [ -f "$buf_file" ] || continue
      BUF_PAYLOAD=$(cat "$buf_file")
      BUF_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$APP_URL/api/cli-usage" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $API_TOKEN" \
        -d "$BUF_PAYLOAD" \
        --connect-timeout 3 \
        --max-time 5 \
        2>/dev/null || echo -e "\n000")
      BUF_CODE=$(echo "$BUF_RESPONSE" | tail -1)
      if [ "$BUF_CODE" = "200" ] || [ "$BUF_CODE" = "201" ]; then
        rm -f "$buf_file"
      fi
    done
  fi
else
  # Failed — buffer locally
  mkdir -p "$BUFFER_DIR"
  echo "$PAYLOAD" > "$BUFFER_DIR/${SESSION_ID}.json"
fi

exit 0
```

**Step 2: Commit**

```bash
chmod +x apps/app/scripts/cli-tracker-hook.sh
git add apps/app/scripts/cli-tracker-hook.sh
git commit -m "feat: add CLI tracker hook script for Claude Code"
```

---

### Task 7: Create the setup script

**Files:**
- Create: `apps/app/scripts/cli-tracker-setup.sh`

**Step 1: Write the setup script**

Create `apps/app/scripts/cli-tracker-setup.sh`:

```bash
#!/usr/bin/env bash
# CLI Tracker Setup Script
# Configures Claude Code to send usage data to your admin dashboard.
#
# Usage: ./cli-tracker-setup.sh

set -euo pipefail

CONFIG_DIR="${HOME}/.claude"
TOKEN_FILE="$CONFIG_DIR/cli-tracker-token"
URL_FILE="$CONFIG_DIR/cli-tracker-url"
HOOKS_DIR="$CONFIG_DIR/hooks"
SETTINGS_FILE="$CONFIG_DIR/settings.json"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_SOURCE="$SCRIPT_DIR/cli-tracker-hook.sh"

echo "=== Claude Code CLI Tracker Setup ==="
echo ""

# Step 1: Get app URL
read -rp "Enter your app URL (e.g. https://your-app.vercel.app): " APP_URL
APP_URL="${APP_URL%/}" # Remove trailing slash

if [ -z "$APP_URL" ]; then
  echo "Error: App URL is required."
  exit 1
fi

# Step 2: Get API key
echo ""
echo "Create an API key at: ${APP_URL}/settings/api-keys"
echo ""
read -rp "Paste your API key here: " API_KEY

if [ -z "$API_KEY" ]; then
  echo "Error: API key is required."
  exit 1
fi

# Step 3: Save config
mkdir -p "$CONFIG_DIR"
echo -n "$API_KEY" > "$TOKEN_FILE"
echo -n "$APP_URL" > "$URL_FILE"
echo "Saved API key and URL to ~/.claude/"

# Step 4: Install hook script
mkdir -p "$HOOKS_DIR"
cp "$HOOK_SOURCE" "$HOOKS_DIR/cli-tracker.sh"
chmod +x "$HOOKS_DIR/cli-tracker.sh"
echo "Installed hook script to ~/.claude/hooks/cli-tracker.sh"

# Step 5: Configure Claude Code settings
if [ ! -f "$SETTINGS_FILE" ]; then
  echo '{}' > "$SETTINGS_FILE"
fi

# Add hook configuration using jq
HOOK_CONFIG='{"matcher":"*","hooks":[{"type":"command","command":"~/.claude/hooks/cli-tracker.sh","timeout":10}]}'

UPDATED=$(jq --argjson hook "$HOOK_CONFIG" '
  .hooks //= {} |
  .hooks.Stop //= [] |
  if (.hooks.Stop | map(select(.hooks[]?.command == "~/.claude/hooks/cli-tracker.sh")) | length) == 0
  then .hooks.Stop += [$hook]
  else .
  end
' "$SETTINGS_FILE")

echo "$UPDATED" > "$SETTINGS_FILE"
echo "Added Stop hook to ~/.claude/settings.json"

echo ""
echo "Setup complete! Claude Code will now track usage automatically."
echo "View your stats at: ${APP_URL}/admin/stats (CLI Usage tab)"
```

**Step 2: Commit**

```bash
chmod +x apps/app/scripts/cli-tracker-setup.sh
git add apps/app/scripts/cli-tracker-setup.sh
git commit -m "feat: add CLI tracker setup script for developer onboarding"
```

---

### Task 8: Update the API keys settings page with CLI tracker hint

**Files:**
- Modify: `apps/app/app/pages/settings/api-keys.vue:78-79` (description text)

**Step 1: Update the description to mention CLI tracking**

Change the description paragraph (line 78) in `apps/app/app/pages/settings/api-keys.vue`:

```html
      <p class="text-sm text-muted max-w-lg">
        Create personal API keys to authenticate with the SDK or CLI usage tracker.
      </p>
```

**Step 2: Commit**

```bash
git add apps/app/app/pages/settings/api-keys.vue
git commit -m "feat: mention CLI tracker in API keys page description"
```

---

### Task 9: Lint, typecheck, and verify

**Step 1: Run lint**

```bash
bun run lint:fix
```

Expected: No errors (auto-fixes applied).

**Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: No type errors.

**Step 3: Run dev server and verify**

```bash
bun run dev:app
```

Manual verification:
- Visit `/admin/stats` — tab switcher shows "App Usage" and "CLI Usage"
- Click "CLI Usage" — shows empty state or skeleton
- Visit `/settings/api-keys` — updated description mentions CLI tracker

**Step 4: Commit any lint fixes**

```bash
git add -A
git commit -m "chore: lint fixes for CLI usage tracking"
```
