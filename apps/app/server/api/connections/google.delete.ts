import { Composio } from '@composio/core'
import { kv } from '@nuxthub/kv'
import { COMPOSIO_KV_KEYS, COMPOSIO_TOOLKIT_SLUGS } from '../../utils/composio/types'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const apiKey = process.env.COMPOSIO_PLAYGROUND_API_KEY
  if (!apiKey) {
    throw createError({ statusCode: 500, statusMessage: 'Composio not configured' })
  }

  try {
    const composio = new Composio({ apiKey })

    // Revoke active connected accounts on Composio's side
    const accounts = await composio.connectedAccounts.list({
      userIds: [user.id],
      toolkitSlugs: COMPOSIO_TOOLKIT_SLUGS,
      statuses: ['ACTIVE'],
    })
    await Promise.all(accounts.items.map(a => composio.connectedAccounts.delete(a.id)))

    // Clear cached session
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
