import { createMCPClient } from '@ai-sdk/mcp'
import { log } from 'evlog'
import { createComposioSession } from './client'

export async function getComposioTools(userId: string): Promise<Record<string, unknown>> {
  try {
    const session = await createComposioSession(userId)

    const mcpClient = await createMCPClient({
      transport: {
        type: 'http',
        url: session.mcp.url,
        headers: session.mcp.headers,
      },
    })

    const tools = await mcpClient.tools()
    log.info('composio', `Loaded ${Object.keys(tools).length} Composio tools for user ${userId}`)
    return tools
  } catch (error) {
    log.warn('composio', `Failed to load Composio tools for user ${userId}: ${error instanceof Error ? error.message : String(error)}`)
    return {}
  }
}
