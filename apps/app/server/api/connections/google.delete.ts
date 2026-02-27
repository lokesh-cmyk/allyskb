import { COMPOSIO_KV_KEYS } from '../../utils/composio/types'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const apiKey = process.env.COMPOSIO_PLAYGROUND_API_KEY
  if (!apiKey) {
    throw createError({ statusCode: 500, statusMessage: 'Composio not configured' })
  }

  try {
    const kv = hubKV()
    await kv.del(COMPOSIO_KV_KEYS.session(user.id))

    return { success: true }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to disconnect Google',
      data: { why: error instanceof Error ? error.message : 'Unknown error' },
    })
  }
})
