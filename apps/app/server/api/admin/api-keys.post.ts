import { z } from 'zod'

const bodySchema = z.object({
  name: z.string().min(1).max(100).optional(),
})

export default defineEventHandler(async (event) => {
  const requestLog = useLogger(event)
  const { user } = await requireAdmin(event)
  const body = await readValidatedBody(event, bodySchema.parse)

  requestLog.set({ adminUserId: user.id, keyName: body.name || 'Admin key' })

  const auth = serverAuth(event)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (auth.api as any).createApiKey({
    body: {
      name: body.name || 'Admin key',
      prefix: 'sk',
      userId: user.id,
    },
  })

  return result
})
