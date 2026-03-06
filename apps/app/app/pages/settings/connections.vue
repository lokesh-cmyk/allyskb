<script setup lang="ts">
definePageMeta({ auth: 'user' })

useSeoMeta({ title: 'Connections' })

const toast = useToast()
const { showError } = useErrorToast()

const { data: connectionsData, refresh, status } = useLazyAsyncData(
  'connections',
  () => $fetch('/api/connections'),
  { server: false },
)

const toolkits = computed(() => connectionsData.value?.toolkits ?? [])

/** Human-readable labels for known toolkit slugs */
const TOOLKIT_LABELS: Record<string, { name: string, icon: string, description: string }> = {
  googlesuper: {
    name: 'Google',
    icon: 'i-simple-icons-google',
    description: 'Gmail, Calendar, Drive, Sheets, Docs, Contacts, Tasks and more',
  },
  slack: {
    name: 'Slack',
    icon: 'i-simple-icons-slack',
    description: 'Read and send messages, manage channels and workspaces',
  },
  notion: {
    name: 'Notion',
    icon: 'i-simple-icons-notion',
    description: 'Read and update pages, databases, and blocks',
  },
  github: {
    name: 'GitHub',
    icon: 'i-simple-icons-github',
    description: 'Manage issues, PRs, repos, and notifications',
  },
  linear: {
    name: 'Linear',
    icon: 'i-simple-icons-linear',
    description: 'Create and manage issues, projects, and cycles',
  },
  jira: {
    name: 'Jira',
    icon: 'i-simple-icons-jira',
    description: 'Manage issues, projects, and sprints',
  },
}

function getToolkitMeta(slug: string) {
  return TOOLKIT_LABELS[slug] ?? {
    name: slug,
    icon: 'i-lucide-plug',
    description: `Connected via Composio (${slug})`,
  }
}

const pendingMap = ref<Record<string, boolean>>({})

async function connect(slug: string) {
  pendingMap.value[slug] = true
  try {
    const { connectUrl } = await $fetch(`/api/connections/${slug}`, { method: 'POST' })
    window.open(connectUrl, '_blank')
    toast.add({ title: 'Complete the connection in the new tab, then click "Check status" here', icon: 'i-lucide-external-link' })
  } catch (e) {
    showError(e, { fallback: `Failed to start ${getToolkitMeta(slug).name} connection` })
  } finally {
    pendingMap.value[slug] = false
  }
}

async function disconnect(slug: string) {
  pendingMap.value[`del_${slug}`] = true
  try {
    await $fetch(`/api/connections/${slug}`, { method: 'DELETE' })
    await refresh()
    toast.add({ title: `${getToolkitMeta(slug).name} disconnected`, icon: 'i-lucide-check' })
  } catch (e) {
    showError(e, { fallback: `Failed to disconnect ${getToolkitMeta(slug).name}` })
  } finally {
    pendingMap.value[`del_${slug}`] = false
  }
}

// Re-check connection status when user returns to this tab after OAuth
onMounted(() => {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refresh()
    }
  })
})
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
        Connect services so the AI can access your data and take actions on your behalf.
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

          <template v-else-if="toolkits.length > 0">
            <div
              v-for="toolkit in toolkits"
              :key="toolkit.slug"
              class="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div class="flex items-center gap-3">
                <UIcon :name="getToolkitMeta(toolkit.slug).icon" class="size-5 text-highlighted" />
                <div>
                  <p class="text-sm text-highlighted">
                    {{ getToolkitMeta(toolkit.slug).name }}
                  </p>
                  <p class="text-xs text-muted">
                    {{ toolkit.connected ? `Connected — ${getToolkitMeta(toolkit.slug).description}` : 'Not connected' }}
                  </p>
                </div>
              </div>

              <UButton
                v-if="toolkit.connected"
                label="Disconnect"
                color="neutral"
                variant="ghost"
                size="xs"
                :loading="pendingMap[`del_${toolkit.slug}`]"
                @click="disconnect(toolkit.slug)"
              />
              <div v-else class="flex items-center gap-2">
                <UButton
                  label="Connect"
                  size="xs"
                  :loading="pendingMap[toolkit.slug]"
                  @click="connect(toolkit.slug)"
                />
                <UButton
                  label="Check status"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-refresh-cw"
                  @click="refresh()"
                />
              </div>
            </div>
          </template>

          <div v-else class="px-4 py-6 text-center">
            <p class="text-sm text-muted">
              No integrations configured. Add toolkit slugs to <code class="font-mono text-xs">COMPOSIO_TOOLKIT_SLUGS</code> to enable connections.
            </p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
