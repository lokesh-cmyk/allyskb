import { z } from 'zod'
import { getComposioApiKey, COMPOSIO_TOOLKIT_SLUGS } from '../../utils/composio/types'
import { getConnectedToolkits } from '../../utils/composio/client'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const { toolkit } = await getValidatedRouterParams(event, z.object({
    toolkit: z.string(),
  }).parse)

  if (!getComposioApiKey()) {
    return { connected: false }
  }

  // Only allow querying toolkits that are configured
  if (!COMPOSIO_TOOLKIT_SLUGS.includes(toolkit)) {
    return { connected: false }
  }

  try {
    const connected = await getConnectedToolkits(user.id, [toolkit])
    return { connected: connected.length > 0 }
  } catch {
    return { connected: false }
  }
})
