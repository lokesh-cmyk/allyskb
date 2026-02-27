import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Missing invitation ID' })
  }

  const [invitation] = await db
    .select({ id: schema.invitations.id })
    .from(schema.invitations)
    .where(eq(schema.invitations.id, id))
    .limit(1)

  if (!invitation) {
    throw createError({ statusCode: 404, message: 'Invitation not found' })
  }

  await db.delete(schema.invitations).where(eq(schema.invitations.id, id))

  return { deleted: true }
})
