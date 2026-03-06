import { Composio } from '@composio/core'
import { kv } from '@nuxthub/kv'
import { COMPOSIO_KV_KEYS, COMPOSIO_SESSION_TTL, COMPOSIO_TOOLKIT_SLUGS, getComposioApiKey } from './types'
import type { ComposioSessionCache } from './types'

/** Creates a fresh Composio client (stateless, safe for serverless) */
function createComposioClient(): Composio {
  const apiKey = getComposioApiKey()
  if (!apiKey) throw new Error('COMPOSIO_API_KEY is not set')
  return new Composio({ apiKey })
}

export async function createComposioSession(userId: string, toolkitSlugs: string[] = COMPOSIO_TOOLKIT_SLUGS) {
  const cacheKey = COMPOSIO_KV_KEYS.session(userId)

  const cached = await kv.get<ComposioSessionCache>(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return { mcp: { url: cached.url, headers: cached.headers } }
  }

  const composio = createComposioClient()
  const session = await composio.create(userId, { toolkits: toolkitSlugs })

  const sessionData: ComposioSessionCache = {
    url: session.mcp.url,
    headers: session.mcp.headers as Record<string, string>,
    expiresAt: Date.now() + COMPOSIO_SESSION_TTL * 1000,
  }
  await kv.set(cacheKey, sessionData, { ttl: COMPOSIO_SESSION_TTL })

  return { mcp: { url: session.mcp.url, headers: session.mcp.headers } }
}

/**
 * Check if a user has an active connection for one or more toolkits.
 * Returns the connected toolkit slugs.
 */
export async function getConnectedToolkits(userId: string, toolkitSlugs: string[] = COMPOSIO_TOOLKIT_SLUGS): Promise<string[]> {
  const composio = createComposioClient()
  const accounts = await composio.connectedAccounts.list({
    userIds: [userId],
    toolkitSlugs,
    statuses: ['ACTIVE'],
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return accounts.items.map((a: any) => a.toolkit?.slug ?? '').filter(Boolean)
}

/**
 * Initiate OAuth for a specific toolkit. Returns the redirect URL.
 * Uses COMPOSIO_AUTH_CONFIG_ID for production OAuth if set,
 * otherwise falls back to Composio's shared OAuth app (playground).
 */
export async function initiateToolkitConnection(userId: string, toolkitSlug: string): Promise<string> {
  const composio = createComposioClient()

  // Clear cached session so it's rebuilt after OAuth completes
  await kv.del(COMPOSIO_KV_KEYS.session(userId))

  const authConfigId = process.env.COMPOSIO_AUTH_CONFIG_ID
  if (authConfigId) {
    const connectionRequest = await composio.connectedAccounts.link(userId, authConfigId)
    if (!connectionRequest.redirectUrl) throw new Error('Composio did not return a redirect URL')
    return connectionRequest.redirectUrl
  }

  const session = await composio.create(userId, { toolkits: [toolkitSlug] })
  const connectionRequest = await session.authorize(toolkitSlug)
  if (!connectionRequest.redirectUrl) throw new Error('Composio did not return a redirect URL')
  return connectionRequest.redirectUrl
}

/**
 * Revoke a user's connection for one or more toolkits.
 */
export async function revokeToolkitConnections(userId: string, toolkitSlugs: string[]): Promise<void> {
  const composio = createComposioClient()
  const accounts = await composio.connectedAccounts.list({
    userIds: [userId],
    toolkitSlugs,
    statuses: ['ACTIVE'],
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await Promise.all(accounts.items.map((a: any) => composio.connectedAccounts.delete(a.id)))
  await kv.del(COMPOSIO_KV_KEYS.session(userId))
}
