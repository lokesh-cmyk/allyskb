import { createMCPClient } from '@ai-sdk/mcp'
import { kv } from '@nuxthub/kv'
import { log } from 'evlog'
import { createComposioSession } from './client'
import { COMPOSIO_KV_KEYS } from './types'

async function loadToolsFromSession(url: string, headers: Record<string, string>): Promise<Record<string, unknown>> {
  // Try Streamable HTTP first (MCP 1.0+), fall back to SSE (legacy)
  try {
    const client = await createMCPClient({ transport: { type: 'http', url, headers } })
    return await client.tools()
  } catch {
    const client = await createMCPClient({ transport: { type: 'sse', url, headers } })
    return await client.tools()
  }
}

export async function getComposioTools(userId: string): Promise<Record<string, unknown>> {
  try {
    const session = await createComposioSession(userId)
    const tools = await loadToolsFromSession(session.mcp.url, session.mcp.headers as Record<string, string>)
    const toolCount = Object.keys(tools).length

    if (toolCount === 0) {
      // Session may be stale — clear cache and retry once with a fresh session
      log.warn('composio', `No tools returned for user ${userId}, refreshing session`)
      await kv.del(COMPOSIO_KV_KEYS.session(userId))

      const freshSession = await createComposioSession(userId)
      const freshTools = await loadToolsFromSession(freshSession.mcp.url, freshSession.mcp.headers as Record<string, string>)
      const freshCount = Object.keys(freshTools).length
      const sampleNames = Object.keys(freshTools).slice(0, 5).join(', ')
      log.info('composio', `Loaded ${freshCount} tools for user ${userId} after refresh${freshCount ? ` (e.g. ${sampleNames})` : ''}`)
      return freshTools
    }

    const sampleNames = Object.keys(tools).slice(0, 5).join(', ')
    log.info('composio', `Loaded ${toolCount} tools for user ${userId} (e.g. ${sampleNames})`)
    return tools
  } catch (error) {
    log.warn('composio', `Failed to load Composio tools for user ${userId}: ${error instanceof Error ? error.message : String(error)}`)
    return {}
  }
}
