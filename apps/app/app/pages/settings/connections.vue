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
