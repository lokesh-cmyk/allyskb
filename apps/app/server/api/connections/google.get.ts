import { Composio } from '@composio/core'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const apiKey = process.env.COMPOSIO_PLAYGROUND_API_KEY
  if (!apiKey) {
    return { connected: false }
  }

  try {
    const composio = new Composio({ apiKey })
    const session = await composio.create(user.id, {
      toolkits: [process.env.COMPOSIO_TOOLKIT_SLUG || 'googlesuper'],
    })
    const tools = await session.tools()
    return { connected: Object.keys(tools).length > 0 }
  } catch {
    return { connected: false }
  }
})
