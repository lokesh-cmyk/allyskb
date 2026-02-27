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
