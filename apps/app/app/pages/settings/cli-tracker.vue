<script setup lang="ts">
definePageMeta({ auth: 'user' })

useSeoMeta({ title: 'CLI Tracker Setup' })

const toast = useToast()
const appUrl = computed(() => window.location.origin)

function copyText(text: string) {
  navigator.clipboard.writeText(text)
  toast.add({ title: 'Copied to clipboard', icon: 'i-lucide-clipboard-check' })
}
</script>

<template>
  <div class="px-6 py-8 max-w-2xl mx-auto w-full">
    <header class="mb-8">
      <div class="flex items-center gap-2 mb-1">
        <UButton
          icon="i-lucide-arrow-left"
          variant="ghost"
          color="neutral"
          size="xs"
          to="/settings"
        />
        <h1 class="text-lg font-medium text-highlighted font-pixel tracking-wide">
          CLI Tracker Setup
        </h1>
      </div>
      <p class="text-sm text-muted max-w-lg">
        Track your Claude Code CLI usage automatically. Follow the steps below to set up the tracker on your machine.
      </p>
    </header>

    <div class="space-y-6">
      <section>
        <h2 class="text-[10px] text-muted uppercase tracking-wide mb-3 font-pixel">
          Step 1 — Create an API Key
        </h2>
        <div class="rounded-lg border border-default divide-y divide-default">
          <div class="flex items-center justify-between gap-4 px-4 py-3">
            <div>
              <p class="text-sm text-highlighted">
                Generate a personal API key
              </p>
              <p class="text-xs text-muted">
                You'll need this to authenticate the CLI tracker with the app.
              </p>
            </div>
            <UButton
              label="Go to API Keys"
              icon="i-lucide-arrow-up-right"
              trailing
              size="xs"
              to="/settings/api-keys"
            />
          </div>
        </div>
      </section>

      <section>
        <h2 class="text-[10px] text-muted uppercase tracking-wide mb-3 font-pixel">
          Step 2 — Download & Run Setup
        </h2>
        <div class="rounded-lg border border-default divide-y divide-default">
          <div class="px-4 py-3">
            <p class="text-sm text-highlighted mb-2">
              Option A: One-liner install
            </p>
            <p class="text-xs text-muted mb-3">
              Run this command in your terminal. It will download both scripts and start the setup.
            </p>
            <div class="flex items-center gap-2">
              <code class="flex-1 text-xs bg-elevated px-3 py-2 rounded-md font-mono break-all">curl -sO {{ appUrl }}/cli-tracker-setup.sh && curl -sO {{ appUrl }}/cli-tracker-hook.sh && bash cli-tracker-setup.sh</code>
              <UButton
                icon="i-lucide-copy"
                color="neutral"
                variant="ghost"
                size="xs"
                @click="copyText(`curl -sO ${appUrl}/cli-tracker-setup.sh && curl -sO ${appUrl}/cli-tracker-hook.sh && bash cli-tracker-setup.sh`)"
              />
            </div>
          </div>
          <div class="px-4 py-3">
            <p class="text-sm text-highlighted mb-2">
              Option B: Manual download
            </p>
            <p class="text-xs text-muted mb-3">
              Download the scripts individually and run the setup manually.
            </p>
            <div class="flex items-center gap-2">
              <UButton
                label="cli-tracker-setup.sh"
                icon="i-lucide-download"
                color="neutral"
                variant="soft"
                size="xs"
                to="/cli-tracker-setup.sh"
                download
              />
              <UButton
                label="cli-tracker-hook.sh"
                icon="i-lucide-download"
                color="neutral"
                variant="soft"
                size="xs"
                to="/cli-tracker-hook.sh"
                download
              />
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 class="text-[10px] text-muted uppercase tracking-wide mb-3 font-pixel">
          Step 3 — Setup prompts
        </h2>
        <div class="rounded-lg border border-default divide-y divide-default">
          <div class="px-4 py-3">
            <p class="text-sm text-highlighted mb-2">
              The setup script will ask for two things:
            </p>
            <div class="space-y-3 mt-3">
              <div class="flex items-start gap-3">
                <span class="text-xs font-mono bg-elevated px-2 py-0.5 rounded shrink-0">1</span>
                <div>
                  <p class="text-sm text-highlighted">
                    App URL
                  </p>
                  <div class="flex items-center gap-2 mt-1">
                    <code class="text-xs bg-elevated px-2 py-1 rounded-md font-mono">{{ appUrl }}</code>
                    <UButton
                      icon="i-lucide-copy"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      @click="copyText(appUrl)"
                    />
                  </div>
                </div>
              </div>
              <div class="flex items-start gap-3">
                <span class="text-xs font-mono bg-elevated px-2 py-0.5 rounded shrink-0">2</span>
                <div>
                  <p class="text-sm text-highlighted">
                    API Key
                  </p>
                  <p class="text-xs text-muted">
                    Paste the key you created in Step 1.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 class="text-[10px] text-muted uppercase tracking-wide mb-3 font-pixel">
          Step 4 — Verify
        </h2>
        <div class="rounded-lg border border-default divide-y divide-default">
          <div class="px-4 py-3">
            <p class="text-sm text-highlighted mb-1">
              Start using Claude Code CLI
            </p>
            <p class="text-xs text-muted">
              Open Claude Code and have a short conversation. After Claude responds, the hook fires automatically in the background. Ask your admin to check the <strong>CLI Usage</strong> tab on the admin stats page — your session should appear within seconds.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 class="text-[10px] text-muted uppercase tracking-wide mb-3 font-pixel">
          Troubleshooting
        </h2>
        <div class="rounded-lg border border-default divide-y divide-default">
          <div class="px-4 py-3">
            <p class="text-sm text-highlighted mb-1">
              Hook not firing?
            </p>
            <p class="text-xs text-muted">
              Check your Claude Code settings:
            </p>
            <code class="text-xs bg-elevated px-3 py-2 rounded-md font-mono mt-2 block">cat ~/.claude/settings.json | jq '.hooks.Stop'</code>
          </div>
          <div class="px-4 py-3">
            <p class="text-sm text-highlighted mb-1">
              Data not showing up?
            </p>
            <p class="text-xs text-muted">
              If the app was unreachable, data is buffered locally. Check for buffered files:
            </p>
            <code class="text-xs bg-elevated px-3 py-2 rounded-md font-mono mt-2 block">ls ~/.claude/usage-buffer/</code>
            <p class="text-xs text-muted mt-1">
              They'll sync automatically on the next successful Claude Code session.
            </p>
          </div>
          <div class="px-4 py-3">
            <p class="text-sm text-highlighted mb-1">
              Want to uninstall?
            </p>
            <p class="text-xs text-muted">
              Remove the hook and config files:
            </p>
            <code class="text-xs bg-elevated px-3 py-2 rounded-md font-mono mt-2 block break-all">rm ~/.claude/hooks/cli-tracker.sh ~/.claude/cli-tracker-token ~/.claude/cli-tracker-url</code>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
