import { db, schema } from '@nuxthub/db'
import { desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const invitations = await db
    .select()
    .from(schema.invitations)
    .orderBy(desc(schema.invitations.createdAt))

  return invitations
})
