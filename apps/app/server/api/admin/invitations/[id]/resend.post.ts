import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await requireAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Missing invitation ID' })
  }

  const [invitation] = await db
    .select()
    .from(schema.invitations)
    .where(eq(schema.invitations.id, id))
    .limit(1)

  if (!invitation) {
    throw createError({ statusCode: 404, message: 'Invitation not found' })
  }

  if (invitation.status !== 'pending') {
    throw createError({
      statusCode: 400,
      message: `Cannot resend a ${invitation.status} invitation`,
    })
  }

  const newExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000)

  await db
    .update(schema.invitations)
    .set({ expiresAt: newExpiresAt })
    .where(eq(schema.invitations.id, id))

  await sendInvitationEmail({
    to: invitation.email,
    inviteToken: invitation.token,
    invitedByName: user.name || user.email || 'An admin',
    role: invitation.role,
  })

  return { success: true }
})
