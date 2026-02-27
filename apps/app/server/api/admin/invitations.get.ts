import { db, schema } from '@nuxthub/db'
import { desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  try {
    const invitations = await db
      .select()
      .from(schema.invitations)
      .orderBy(desc(schema.invitations.createdAt))

    return invitations
  } catch (error) {
    // Table may not exist yet if migration hasn't been applied
    console.error('[invitations] Failed to fetch invitations:', error)
    return []
  }
})
