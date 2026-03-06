import { getComposioApiKey } from '../../utils/composio/types'
import { getConnectedToolkits } from '../../utils/composio/client'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  if (!getComposioApiKey()) {
    return { connected: false }
  }

  try {
    const connected = await getConnectedToolkits(user.id, ['googlesuper'])
    return { connected: connected.length > 0 }
  } catch {
    return { connected: false }
  }
})
