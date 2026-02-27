import { db, schema } from '@nuxthub/db'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  email: z.email('Invalid email address'),
  role: z.enum(['user', 'admin']).default('user'),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireAdmin(event)
  const body = await readValidatedBody(event, bodySchema.parse)

  const [existing] = await db
    .select()
    .from(schema.invitations)
    .where(and(
      eq(schema.invitations.email, body.email.toLowerCase()),
      eq(schema.invitations.status, 'pending'),
    ))
    .limit(1)

  if (existing) {
    throw createError({
      statusCode: 409,
      message: 'An active invitation already exists for this email',
      data: { why: `A pending invitation was already sent to ${body.email}`, fix: 'Revoke the existing invitation first or resend it' },
    })
  }

  const [existingUser] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, body.email.toLowerCase()))
    .limit(1)

  if (existingUser) {
    throw createError({
      statusCode: 409,
      message: 'A user with this email already exists',
      data: { why: `An account already exists for ${body.email}`, fix: 'This user can already sign in' },
    })
  }

  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000)

  const [invitation] = await db
    .insert(schema.invitations)
    .values({
      email: body.email.toLowerCase(),
      role: body.role,
      invitedBy: user.id,
      expiresAt,
    })
    .returning()

  if (!invitation) {
    throw createError({ statusCode: 500, message: 'Failed to create invitation' })
  }

  try {
    await sendInvitationEmail({
      to: invitation.email,
      inviteToken: invitation.token,
      invitedByName: user.name || user.email || 'An admin',
      role: invitation.role,
    })
  } catch (error) {
    console.error('[invitations] Failed to send email:', error)
  }

  return invitation
})
