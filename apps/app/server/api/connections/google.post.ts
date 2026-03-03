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
    // Clear cached session so a fresh one is created after OAuth completes
    await kv.del(COMPOSIO_KV_KEYS.session(user.id))

    const composio = new Composio({ apiKey })
    const authConfigId = process.env.COMPOSIO_AUTH_CONFIG_ID
    let redirectUrl: string | null | undefined

    if (authConfigId) {
      const connectionRequest = await composio.connectedAccounts.link(user.id, authConfigId)
      redirectUrl = connectionRequest.redirectUrl
    } else {
      const toolkitSlug = COMPOSIO_TOOLKIT_SLUGS[0]
      if (!toolkitSlug) {
        throw new Error('COMPOSIO_TOOLKIT_SLUG is not configured')
      }

      const session = await composio.create(user.id, { toolkits: COMPOSIO_TOOLKIT_SLUGS })
      const connectionRequest = await session.authorize(toolkitSlug)
      redirectUrl = connectionRequest.redirectUrl
    }

    if (!redirectUrl) {
      throw new Error('Composio did not return an OAuth redirect URL')
    }

    return { connectUrl: redirectUrl }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to initiate Google connection',
      data: { why: error instanceof Error ? error.message : 'Unknown error' },
    })
  }
})
