import { Composio } from '@composio/core'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const apiKey = process.env.COMPOSIO_PLAYGROUND_API_KEY
  if (!apiKey) {
    throw createError({ statusCode: 500, statusMessage: 'Composio not configured' })
  }

  try {
    const composio = new Composio({ apiKey })
    const session = await composio.create(user.id, {
      toolkits: [process.env.COMPOSIO_TOOLKIT_SLUG || 'googlesuper'],
    })

    const connectUrl = session.mcp.url.replace('/mcp', '/connect')
    return { connectUrl }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to initiate Google connection',
      data: { why: error instanceof Error ? error.message : 'Unknown error' },
    })
  }
})
