import { getComposioApiKey } from '../../utils/composio/types'
import { initiateToolkitConnection } from '../../utils/composio/client'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  if (!getComposioApiKey()) {
    throw createError({ statusCode: 500, statusMessage: 'Composio not configured' })
  }

  try {
    const connectUrl = await initiateToolkitConnection(user.id, 'googlesuper')
    return { connectUrl }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to initiate Google connection',
      data: { why: error instanceof Error ? error.message : 'Unknown error' },
    })
  }
})
