/**
 * Comma-separated toolkit slugs from env, e.g. "googlesuper,slack,notion"
 * Add any Composio-supported toolkit slug to integrate more platforms.
 */
export const COMPOSIO_TOOLKIT_SLUGS: string[] = (
  process.env.COMPOSIO_TOOLKIT_SLUGS
  || process.env.COMPOSIO_TOOLKIT_SLUG
  || 'googlesuper'
).split(',').map(s => s.trim()).filter(Boolean)

export const COMPOSIO_KV_KEYS = {
  session: (userId: string) => `composio:session:${userId}`,
} as const

/** 15 minutes — short enough to avoid stale sessions, long enough to avoid excessive re-creation */
export const COMPOSIO_SESSION_TTL = 60 * 15

export interface ComposioSessionCache {
  url: string
  headers: Record<string, string>
  expiresAt: number
}

/** Returns the configured Composio API key, supporting both env var names */
export function getComposioApiKey(): string | undefined {
  return process.env.COMPOSIO_API_KEY || process.env.COMPOSIO_PLAYGROUND_API_KEY
}
