import { Composio } from '@composio/core'
import { COMPOSIO_TOOLKIT_SLUGS } from '../../utils/composio/types'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const apiKey = process.env.COMPOSIO_PLAYGROUND_API_KEY
  if (!apiKey) {
    return { connected: false }
  }

  try {
    const composio = new Composio({ apiKey })
    const accounts = await composio.connectedAccounts.list({
      userIds: [user.id],
      toolkitSlugs: COMPOSIO_TOOLKIT_SLUGS,
      statuses: ['ACTIVE'],
    })
    return { connected: accounts.items.length > 0 }
  } catch {
    return { connected: false }
  }
})
