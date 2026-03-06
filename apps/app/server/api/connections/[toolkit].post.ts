import { z } from 'zod'
import { getComposioApiKey, COMPOSIO_TOOLKIT_SLUGS } from '../../utils/composio/types'
import { initiateToolkitConnection } from '../../utils/composio/client'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const { toolkit } = await getValidatedRouterParams(event, z.object({
    toolkit: z.string(),
  }).parse)

  if (!getComposioApiKey()) {
    throw createError({ statusCode: 500, statusMessage: 'Composio not configured' })
  }

  if (!COMPOSIO_TOOLKIT_SLUGS.includes(toolkit)) {
    throw createError({ statusCode: 400, statusMessage: `Toolkit "${toolkit}" is not configured`, data: { fix: `Add "${toolkit}" to COMPOSIO_TOOLKIT_SLUGS env var` } })
  }

  try {
    const connectUrl = await initiateToolkitConnection(user.id, toolkit)
    return { connectUrl }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to initiate ${toolkit} connection`,
      data: { why: error instanceof Error ? error.message : 'Unknown error' },
    })
  }
})
