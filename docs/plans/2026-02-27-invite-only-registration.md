# Invite-Only Registration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace open registration with invite-only signup. Admins create invitations that send emails via Resend. Fix the `/api/snapshot/status` 500 error.

**Architecture:** New `invitations` Drizzle table. Admin APIs to CRUD invitations + send email via Resend. Login page conditionally shows signup only with a valid invite token. Snapshot status endpoint gets error handling.

**Tech Stack:** Drizzle ORM, Resend (email), Zod (validation), Nuxt server routes, Nuxt UI components

---

### Task 1: Fix snapshot/status 500 error

**Files:**
- Modify: `apps/app/server/utils/sandbox/snapshot-sync.ts:63-79`

**Step 1: Add try-catch to `getSnapshotSyncStatus`**

Replace the `getSnapshotSyncStatus` function in `apps/app/server/utils/sandbox/snapshot-sync.ts`:

```ts
export async function getSnapshotSyncStatus(): Promise<SnapshotSyncStatus> {
  try {
    const [current, cached] = await Promise.all([
      getCurrentSnapshot(),
      getCachedLatestSnapshot(),
    ])

    const currentSnapshotId = current?.snapshotId ?? null
    const { latestSnapshotId, latestCreatedAt } = cached
    const needsSync = latestSnapshotId !== null && latestSnapshotId !== currentSnapshotId

    return {
      currentSnapshotId,
      latestSnapshotId,
      needsSync,
      latestCreatedAt,
    }
  }
  catch (error) {
    console.error('[snapshot-sync] Failed to get snapshot status:', error)
    return {
      currentSnapshotId: null,
      latestSnapshotId: null,
      needsSync: false,
      latestCreatedAt: null,
    }
  }
}
```

**Step 2: Commit**

```bash
git add apps/app/server/utils/sandbox/snapshot-sync.ts
git commit -m "fix: handle snapshot status API errors gracefully"
```

---

### Task 2: Add `invitations` table to DB schema

**Files:**
- Modify: `apps/app/server/db/schema.ts`

**Step 1: Add the invitations table at the end of `schema.ts`**

Append after the `usageStats` table definition:

```ts
export const invitations = pgTable('invitations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull(),
  role: text('role', { enum: ['user', 'admin'] }).notNull().default('user'),
  token: text('token').notNull().$defaultFn(() => crypto.randomUUID()),
  status: text('status', { enum: ['pending', 'accepted', 'expired'] }).notNull().default('pending'),
  invitedBy: text('invited_by').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  ...timestamps,
}, table => [
  uniqueIndex('invitations_token_idx').on(table.token),
  index('invitations_email_idx').on(table.email),
])
```

**Step 2: Generate migration**

Run from `apps/app/`:

```bash
cd apps/app && bun run db:generate
```

**Step 3: Apply migration**

```bash
cd apps/app && bun run db:migrate
```

**Step 4: Commit**

```bash
git add apps/app/server/db/schema.ts apps/app/server/db/migrations/
git commit -m "feat: add invitations table schema and migration"
```

---

### Task 3: Install Resend and add email utility

**Files:**
- Create: `apps/app/server/utils/email.ts`
- Modify: `apps/app/package.json` (via bun add)
- Modify: `apps/app/.env.example`
- Modify: `apps/app/nuxt.config.ts`

**Step 1: Install resend**

```bash
cd apps/app && bun add resend
```

**Step 2: Add env vars to `.env.example`**

Add after the Composio section at the end:

```
# --- Email (Resend, required for invitations) ---------------------------------

RESEND_API_KEY=               # Resend API key for sending invitation emails
RESEND_FROM_EMAIL=noreply@yourdomain.com  # From email address for invitations
```

**Step 3: Add runtimeConfig for email**

In `apps/app/nuxt.config.ts`, add inside `runtimeConfig` (after the `youtube` block):

```ts
    email: {
      resendApiKey: '',
      fromEmail: 'noreply@yourdomain.com',
    },
```

**Step 4: Create email utility**

Create `apps/app/server/utils/email.ts`:

```ts
import { Resend } from 'resend'

let resendClient: Resend | null = null

function getResend(): Resend {
  if (!resendClient) {
    const config = useRuntimeConfig()
    const apiKey = config.email?.resendApiKey
    if (!apiKey) {
      throw createError({
        statusCode: 503,
        message: 'Email service not configured',
        data: { why: 'RESEND_API_KEY is not set', fix: 'Add RESEND_API_KEY to your environment variables' },
      })
    }
    resendClient = new Resend(apiKey)
  }
  return resendClient
}

export async function sendInvitationEmail(options: {
  to: string
  inviteToken: string
  invitedByName: string
  role: string
}) {
  const config = useRuntimeConfig()
  const appUrl = process.env.NUXT_PUBLIC_SITE_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'
  const fromEmail = config.email?.fromEmail || 'noreply@yourdomain.com'
  const inviteUrl = `${appUrl}/login?token=${options.inviteToken}`

  const resend = getResend()

  await resend.emails.send({
    from: fromEmail,
    to: options.to,
    subject: `You're invited to join the Knowledge Agent`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
        <h2 style="font-size: 20px; font-weight: 600; margin-bottom: 16px;">You've been invited</h2>
        <p style="color: #525252; font-size: 14px; line-height: 1.6;">
          <strong>${options.invitedByName}</strong> has invited you to join as a <strong>${options.role}</strong>.
        </p>
        <p style="color: #525252; font-size: 14px; line-height: 1.6;">
          This invitation expires in 48 hours.
        </p>
        <a href="${inviteUrl}" style="display: inline-block; margin-top: 16px; padding: 10px 24px; background: #171717; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">
          Accept Invitation
        </a>
        <p style="margin-top: 24px; color: #a3a3a3; font-size: 12px;">
          If the button doesn't work, copy this URL: ${inviteUrl}
        </p>
      </div>
    `,
  })
}
```

**Step 5: Commit**

```bash
git add apps/app/package.json apps/app/server/utils/email.ts apps/app/.env.example apps/app/nuxt.config.ts bun.lock
git commit -m "feat: add Resend email utility for invitations"
```

---

### Task 4: Create invitation API routes

**Files:**
- Create: `apps/app/server/api/admin/invitations.get.ts`
- Create: `apps/app/server/api/admin/invitations.post.ts`
- Create: `apps/app/server/api/admin/invitations/[id].delete.ts`
- Create: `apps/app/server/api/admin/invitations/[id]/resend.post.ts`
- Create: `apps/app/server/api/invitations/validate.get.ts`

**Step 1: Create GET /api/admin/invitations**

Create `apps/app/server/api/admin/invitations.get.ts`:

```ts
import { db, schema } from '@nuxthub/db'
import { desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const invitations = await db
    .select()
    .from(schema.invitations)
    .orderBy(desc(schema.invitations.createdAt))

  return invitations
})
```

**Step 2: Create POST /api/admin/invitations**

Create `apps/app/server/api/admin/invitations.post.ts`:

```ts
import { db, schema } from '@nuxthub/db'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  email: z.email('Invalid email address'),
  role: z.enum(['user', 'admin']).default('user'),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAdmin(event)
  const body = await readValidatedBody(event, bodySchema.parse)

  // Check if there's already a pending invitation for this email
  const [existing] = await db
    .select()
    .from(schema.invitations)
    .where(and(
      eq(schema.invitations.email, body.email.toLowerCase()),
      eq(schema.invitations.status, 'pending'),
    ))
    .limit(1)

  if (existing) {
    throw createError({
      statusCode: 409,
      message: 'An active invitation already exists for this email',
      data: { why: `A pending invitation was already sent to ${body.email}`, fix: 'Revoke the existing invitation first or resend it' },
    })
  }

  // Check if user already exists with this email
  const [existingUser] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, body.email.toLowerCase()))
    .limit(1)

  if (existingUser) {
    throw createError({
      statusCode: 409,
      message: 'A user with this email already exists',
      data: { why: `An account already exists for ${body.email}`, fix: 'This user can already sign in' },
    })
  }

  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000) // 48 hours

  const [invitation] = await db
    .insert(schema.invitations)
    .values({
      email: body.email.toLowerCase(),
      role: body.role,
      invitedBy: user.id,
      expiresAt,
    })
    .returning()

  // Send invitation email
  try {
    await sendInvitationEmail({
      to: invitation.email,
      inviteToken: invitation.token,
      invitedByName: user.name || user.email || 'An admin',
      role: invitation.role,
    })
  }
  catch (error) {
    console.error('[invitations] Failed to send email:', error)
    // Don't delete the invitation — admin can resend
  }

  return invitation
})
```

**Step 3: Create DELETE /api/admin/invitations/[id]**

Create `apps/app/server/api/admin/invitations/[id].delete.ts`:

```ts
import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Missing invitation ID' })
  }

  const [invitation] = await db
    .select({ id: schema.invitations.id })
    .from(schema.invitations)
    .where(eq(schema.invitations.id, id))
    .limit(1)

  if (!invitation) {
    throw createError({ statusCode: 404, message: 'Invitation not found' })
  }

  await db.delete(schema.invitations).where(eq(schema.invitations.id, id))

  return { deleted: true }
})
```

**Step 4: Create POST /api/admin/invitations/[id]/resend**

Create `apps/app/server/api/admin/invitations/[id]/resend.post.ts`:

```ts
import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await requireAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Missing invitation ID' })
  }

  const [invitation] = await db
    .select()
    .from(schema.invitations)
    .where(eq(schema.invitations.id, id))
    .limit(1)

  if (!invitation) {
    throw createError({ statusCode: 404, message: 'Invitation not found' })
  }

  if (invitation.status !== 'pending') {
    throw createError({
      statusCode: 400,
      message: `Cannot resend a ${invitation.status} invitation`,
    })
  }

  // Refresh expiration to 48 hours from now
  const newExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000)

  await db
    .update(schema.invitations)
    .set({ expiresAt: newExpiresAt })
    .where(eq(schema.invitations.id, id))

  await sendInvitationEmail({
    to: invitation.email,
    inviteToken: invitation.token,
    invitedByName: user.name || user.email || 'An admin',
    role: invitation.role,
  })

  return { success: true }
})
```

**Step 5: Create GET /api/invitations/validate (public)**

Create `apps/app/server/api/invitations/validate.get.ts`:

```ts
import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const token = query.token as string

  if (!token) {
    throw createError({ statusCode: 400, message: 'Missing invitation token' })
  }

  const [invitation] = await db
    .select()
    .from(schema.invitations)
    .where(eq(schema.invitations.token, token))
    .limit(1)

  if (!invitation) {
    throw createError({ statusCode: 404, message: 'Invalid invitation link' })
  }

  if (invitation.status === 'accepted') {
    throw createError({ statusCode: 410, message: 'This invitation has already been used' })
  }

  if (invitation.status === 'expired' || new Date() > invitation.expiresAt) {
    // Mark as expired if not already
    if (invitation.status !== 'expired') {
      await db.update(schema.invitations).set({ status: 'expired' }).where(eq(schema.invitations.id, invitation.id))
    }
    throw createError({ statusCode: 410, message: 'This invitation has expired' })
  }

  return {
    email: invitation.email,
    role: invitation.role,
  }
})
```

**Step 6: Commit**

```bash
git add apps/app/server/api/admin/invitations.get.ts apps/app/server/api/admin/invitations.post.ts apps/app/server/api/admin/invitations/[id].delete.ts apps/app/server/api/admin/invitations/[id]/resend.post.ts apps/app/server/api/invitations/validate.get.ts
git commit -m "feat: add invitation CRUD and validation API routes"
```

---

### Task 5: Hook invitations into auth signup flow

**Files:**
- Modify: `apps/app/server/auth.config.ts`
- Modify: `apps/app/nuxt.config.ts` (route rules)

**Step 1: Update auth databaseHooks to process invitations on signup**

Replace the full `databaseHooks` section in `apps/app/server/auth.config.ts`:

```ts
    databaseHooks: {
      user: {
        create: {
          after: async (user: { id: string, email: string }) => {
            const result = await db.select({ total: count() }).from(schema.user)
            // First user becomes admin automatically
            if (result[0]!.total === 1) {
              await db.update(schema.user).set({ role: 'admin' }).where(eq(schema.user.id, user.id))
              return
            }

            // Check for a pending invitation matching this email
            if (user.email) {
              const { and } = await import('drizzle-orm')
              const [invitation] = await db
                .select()
                .from(schema.invitations)
                .where(and(
                  eq(schema.invitations.email, user.email.toLowerCase()),
                  eq(schema.invitations.status, 'pending'),
                ))
                .limit(1)

              if (invitation && new Date() <= invitation.expiresAt) {
                // Assign the invited role and mark invitation as accepted
                await db.update(schema.user).set({ role: invitation.role }).where(eq(schema.user.id, user.id))
                await db.update(schema.invitations).set({ status: 'accepted' }).where(eq(schema.invitations.id, invitation.id))
              }
            }
          },
        },
      },
    },
```

Note: The existing import `import { count, eq } from 'drizzle-orm'` at line 3 already provides `eq`. We add `and` via dynamic import inside the hook since it's not at the top-level import yet. Alternatively, add `and` to the top-level import:

Update line 3 from:
```ts
import { count, eq } from 'drizzle-orm'
```
to:
```ts
import { and, count, eq } from 'drizzle-orm'
```

Then use `and` directly in the hook instead of the dynamic import.

**Step 2: Add route rule to allow public access to invitation validate endpoint**

In `apps/app/nuxt.config.ts`, add to `routeRules` before the admin catch-all:

```ts
    '/api/invitations/**': { auth: false },
```

**Step 3: Commit**

```bash
git add apps/app/server/auth.config.ts apps/app/nuxt.config.ts
git commit -m "feat: process invitation on signup and assign invited role"
```

---

### Task 6: Update login page for invite-only signup

**Files:**
- Modify: `apps/app/app/pages/login.vue`

**Step 1: Add invite token validation logic**

In the `<script setup>` section, after the existing `const state = reactive(...)` block, add the invite token handling. The full updated script becomes (modifications highlighted by comments):

Add these refs after `const { signIn, signUp } = useUserSession()`:

```ts
// Invite-only registration
const inviteToken = computed(() => route.query.token as string | undefined)
const inviteData = ref<{ email: string, role: string } | null>(null)
const inviteError = ref('')
const inviteLoading = ref(false)
```

Add this `onMounted` logic — merge with the existing `onMounted`:

```ts
onMounted(async () => {
  const queryError = route.query.error as string | undefined
  if (queryError) {
    error.value = oauthErrors[queryError] || `Authentication error: ${queryError}`
  }

  // Validate invite token if present
  if (inviteToken.value) {
    inviteLoading.value = true
    try {
      inviteData.value = await $fetch('/api/invitations/validate', {
        query: { token: inviteToken.value },
      })
      mode.value = 'signup'
      state.email = inviteData.value.email
    }
    catch (e: any) {
      inviteError.value = e?.data?.message || 'Invalid or expired invitation link.'
    }
    finally {
      inviteLoading.value = false
    }
  }
})
```

Update the `onSubmit` function to pass the token on signup:

```ts
async function onSubmit() {
  loading.value = true
  error.value = ''
  try {
    if (mode.value === 'signup') {
      await signUp.email({ name: state.name, email: state.email, password: state.password })
    } else {
      await signIn.email({ email: state.email, password: state.password })
    }
    await navigateTo('/', { replace: true })
  } catch (e: any) {
    error.value = e?.data?.message || e?.message || 'Something went wrong. Please try again.'
  } finally {
    loading.value = false
  }
}
```

**Step 2: Update the template**

Key template changes:

1. Hide the "Sign up" toggle link unless user has an invite token
2. Show invite error if token is invalid
3. Make the email field read-only when signing up with an invite
4. Show a loading state while validating the token

Replace the sign-in/sign-up toggle at the bottom (the `<p class="mt-6 text-center text-sm text-muted">` block):

```vue
        <p class="mt-6 text-center text-sm text-muted">
          <template v-if="mode === 'signin'">
            Have an invitation?
            <button
              v-if="inviteToken"
              class="text-highlighted font-medium hover:underline cursor-pointer"
              @click="mode = 'signup'"
            >
              Sign up
            </button>
            <span v-else class="text-dimmed">Contact an admin to get invited.</span>
          </template>
          <template v-else>
            Already have an account?
            <button class="text-highlighted font-medium hover:underline cursor-pointer" @click="mode = 'signin'">
              Sign in
            </button>
          </template>
        </p>
```

Add an invite error alert before the form (after the existing error alert):

```vue
        <UAlert
          v-if="inviteError"
          color="error"
          variant="subtle"
          :title="inviteError"
          icon="i-lucide-circle-alert"
          class="mb-4"
        />

        <UAlert
          v-if="inviteLoading"
          color="neutral"
          variant="subtle"
          title="Validating invitation..."
          icon="i-lucide-loader"
          class="mb-4"
        />
```

Make the email input readonly when invited:

```vue
            <UInput v-model="state.email" type="email" placeholder="you@example.com" size="lg" class="w-full" :readonly="!!inviteData" />
```

**Step 3: Commit**

```bash
git add apps/app/app/pages/login.vue
git commit -m "feat: restrict signup to invite-only on login page"
```

---

### Task 7: Add invitation management UI to admin users page

**Files:**
- Modify: `apps/app/app/pages/admin/users.vue`

**Step 1: Add invitation state and API calls**

Add after the existing `useLazyFetch` for users:

```ts
// Invitations
const { data: invitations, refresh: refreshInvitations, status: invitationsStatus } = useLazyFetch<Array<{
  id: string
  email: string
  role: UserRole
  status: 'pending' | 'accepted' | 'expired'
  expiresAt: string
  createdAt: string
}>>('/api/admin/invitations')

const inviteModalOpen = ref(false)
const inviteForm = reactive({ email: '', role: 'user' as UserRole })
const inviteSending = ref(false)
const resendingId = ref<string | null>(null)
const deletingInviteId = ref<string | null>(null)

const pendingInvitations = computed(() =>
  invitations.value?.filter(i => i.status === 'pending' && new Date(i.expiresAt) > new Date()) ?? [],
)

const pastInvitations = computed(() =>
  invitations.value?.filter(i => i.status !== 'pending' || new Date(i.expiresAt) <= new Date()) ?? [],
)

async function sendInvitation() {
  inviteSending.value = true
  try {
    await $fetch('/api/admin/invitations', {
      method: 'POST',
      body: { email: inviteForm.email, role: inviteForm.role },
    })
    inviteModalOpen.value = false
    inviteForm.email = ''
    inviteForm.role = 'user'
    await refreshInvitations()
    toast.add({ title: 'Invitation sent', icon: 'i-lucide-check' })
  }
  catch (e) {
    showError(e, { fallback: 'Failed to send invitation' })
  }
  finally {
    inviteSending.value = false
  }
}

async function resendInvitation(id: string) {
  resendingId.value = id
  try {
    await $fetch(`/api/admin/invitations/${id}/resend`, { method: 'POST' })
    await refreshInvitations()
    toast.add({ title: 'Invitation resent', icon: 'i-lucide-check' })
  }
  catch (e) {
    showError(e, { fallback: 'Failed to resend invitation' })
  }
  finally {
    resendingId.value = null
  }
}

async function revokeInvitation(id: string) {
  deletingInviteId.value = id
  try {
    await $fetch(`/api/admin/invitations/${id}`, { method: 'DELETE' })
    await refreshInvitations()
    toast.add({ title: 'Invitation revoked', icon: 'i-lucide-check' })
  }
  catch (e) {
    showError(e, { fallback: 'Failed to revoke invitation' })
  }
  finally {
    deletingInviteId.value = null
  }
}
```

**Step 2: Add "Invite User" button to the header**

In the template, update the header `<div class="flex items-center justify-between gap-4">` to add the invite button next to the refresh button:

```vue
        <div class="flex items-center gap-2">
          <UButton
            label="Invite User"
            icon="i-lucide-user-plus"
            size="xs"
            @click="inviteModalOpen = true"
          />
          <UTooltip text="Refresh data">
            <UButton
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="ghost"
              size="xs"
              :loading="status === 'pending'"
              @click="refresh(); refreshInvitations()"
            />
          </UTooltip>
        </div>
```

**Step 3: Add invitations section below the users table**

After the `</section>` that contains the users table, and before the delete `<UModal>`, add:

```vue
    <section class="mt-8">
      <h2 class="text-[10px] text-muted uppercase tracking-wide font-pixel mb-3">
        Pending Invitations
      </h2>

      <div v-if="pendingInvitations.length === 0" class="rounded-lg border border-default bg-elevated/50 p-6 text-center">
        <p class="text-sm text-muted">
          No pending invitations.
        </p>
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="invite in pendingInvitations"
          :key="invite.id"
          class="flex items-center justify-between gap-4 rounded-lg border border-default bg-elevated/50 px-4 py-3"
        >
          <div class="min-w-0">
            <p class="text-xs text-highlighted truncate">
              {{ invite.email }}
            </p>
            <p class="text-[11px] text-muted">
              Invited as <span class="capitalize">{{ invite.role }}</span>
              &middot; Expires {{ formatDate(invite.expiresAt) }}
            </p>
          </div>
          <div class="flex items-center gap-1.5">
            <UButton
              icon="i-lucide-send"
              color="neutral"
              variant="ghost"
              size="xs"
              :loading="resendingId === invite.id"
              @click="resendInvitation(invite.id)"
            />
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="xs"
              :loading="deletingInviteId === invite.id"
              @click="revokeInvitation(invite.id)"
            />
          </div>
        </div>
      </div>
    </section>
```

**Step 4: Add invite modal**

After the existing delete `<UModal>`, add:

```vue
    <UModal v-model:open="inviteModalOpen">
      <template #content>
        <div class="p-6">
          <h3 class="text-sm font-medium text-highlighted mb-4">
            Invite User
          </h3>
          <form class="space-y-4" @submit.prevent="sendInvitation">
            <div>
              <label class="text-xs text-muted mb-1 block">Email</label>
              <UInput
                v-model="inviteForm.email"
                type="email"
                placeholder="user@example.com"
                size="sm"
                required
                class="w-full"
              />
            </div>
            <div>
              <label class="text-xs text-muted mb-1 block">Role</label>
              <USelectMenu
                v-model="inviteForm.role"
                :items="[
                  { label: 'User', value: 'user' },
                  { label: 'Admin', value: 'admin' },
                ]"
                size="sm"
                class="w-full"
              />
            </div>
            <div class="flex justify-end gap-2 pt-2">
              <UButton
                label="Cancel"
                color="neutral"
                variant="ghost"
                size="sm"
                @click="inviteModalOpen = false"
              />
              <UButton
                type="submit"
                label="Send Invitation"
                size="sm"
                :loading="inviteSending"
              />
            </div>
          </form>
        </div>
      </template>
    </UModal>
```

**Step 5: Commit**

```bash
git add apps/app/app/pages/admin/users.vue
git commit -m "feat: add invitation management UI to admin users page"
```

---

### Task 8: Lint and type-check

**Step 1: Run lint fix**

```bash
bun run lint:fix
```

**Step 2: Run typecheck**

```bash
bun run typecheck
```

**Step 3: Fix any errors found, then commit**

```bash
git add -A
git commit -m "chore: lint and type fixes for invitation system"
```

---

### Task 9: Manual testing checklist

1. Start dev server: `bun run dev:app`
2. Visit `/login` — verify "Sign up" link is hidden, shows "Contact an admin to get invited"
3. Sign in as admin, go to `/admin/users`
4. Click "Invite User", enter an email, select role, submit
5. Check that invitation appears in pending list
6. Visit `/login?token=<token>` — verify signup form appears with pre-filled email
7. Create account — verify role is assigned correctly
8. Back in admin, verify invitation status shows as "accepted"
9. Test resend and revoke actions
10. Visit `/api/snapshot/status` — verify it returns JSON (not 500) even if sandbox isn't configured

---

Plan complete and saved to `docs/plans/2026-02-27-invite-only-registration.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
