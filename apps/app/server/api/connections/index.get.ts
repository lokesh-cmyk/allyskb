import { getComposioApiKey, COMPOSIO_TOOLKIT_SLUGS } from '../../utils/composio/types'
import { getConnectedToolkits } from '../../utils/composio/client'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  if (!getComposioApiKey() || COMPOSIO_TOOLKIT_SLUGS.length === 0) {
    return { toolkits: [] }
  }

  try {
    const connected = await getConnectedToolkits(user.id, COMPOSIO_TOOLKIT_SLUGS)
    return {
      toolkits: COMPOSIO_TOOLKIT_SLUGS.map(slug => ({
        slug,
        connected: connected.includes(slug),
      })),
    }
  } catch {
    return {
      toolkits: COMPOSIO_TOOLKIT_SLUGS.map(slug => ({ slug, connected: false })),
    }
  }
})
