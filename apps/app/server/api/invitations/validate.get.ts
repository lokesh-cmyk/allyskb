import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const token = query.token as string

  if (!token) {
    throw createError({ statusCode: 400, message: 'Missing invitation token' })
  }

  const [invitation] = await db
    .select()
    .from(schema.invitations)
    .where(eq(schema.invitations.token, token))
    .limit(1)

  if (!invitation) {
    throw createError({ statusCode: 404, message: 'Invalid invitation link' })
  }

  if (invitation.status === 'accepted') {
    throw createError({ statusCode: 410, message: 'This invitation has already been used' })
  }

  if (invitation.status === 'expired' || new Date() > invitation.expiresAt) {
    if (invitation.status !== 'expired') {
      await db.update(schema.invitations).set({ status: 'expired' }).where(eq(schema.invitations.id, invitation.id))
    }
    throw createError({ statusCode: 410, message: 'This invitation has expired' })
  }

  return {
    email: invitation.email,
    role: invitation.role,
  }
})
