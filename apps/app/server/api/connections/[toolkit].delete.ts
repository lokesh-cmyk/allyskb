import { z } from 'zod'
import { getComposioApiKey, COMPOSIO_TOOLKIT_SLUGS } from '../../utils/composio/types'
import { revokeToolkitConnections } from '../../utils/composio/client'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const { toolkit } = await getValidatedRouterParams(event, z.object({
    toolkit: z.string(),
  }).parse)

  if (!getComposioApiKey()) {
    throw createError({ statusCode: 500, statusMessage: 'Composio not configured' })
  }

  if (!COMPOSIO_TOOLKIT_SLUGS.includes(toolkit)) {
    throw createError({ statusCode: 400, statusMessage: `Toolkit "${toolkit}" is not configured` })
  }

  try {
    await revokeToolkitConnections(user.id, [toolkit])
    return { success: true }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to disconnect ${toolkit}`,
      data: { why: error instanceof Error ? error.message : 'Unknown error' },
    })
  }
})
