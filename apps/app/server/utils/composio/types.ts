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
