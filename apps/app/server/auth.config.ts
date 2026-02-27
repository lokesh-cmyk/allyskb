import { admin, apiKey } from 'better-auth/plugins'
import { schema } from '@nuxthub/db'
import { and, count, eq } from 'drizzle-orm'
import { defineServerAuth } from '@onmax/nuxt-better-auth/config'

export default defineServerAuth(({ db }) => {
  return {
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        scope: ['openid', 'email', 'profile'],
        mapProfileToUser: (profile: { name: string, picture: string }) => ({
          name: profile.name,
          image: profile.picture,
        }),
      },
    },
    user: {
      additionalFields: {
        username: { type: 'string' as const, required: false },
      },
    },
    plugins: [
      admin(),
      apiKey({
        enableSessionForAPIKeys: true,
        customAPIKeyGetter: (ctx) => {
          const xApiKey = ctx.headers?.get('x-api-key')
          if (xApiKey) return xApiKey
          const authHeader = ctx.headers?.get('authorization')
          if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7)
          return null
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          after: async (user: { id: string, email: string }) => {
            const result = await db.select({ total: count() }).from(schema.user)
            // First user becomes admin automatically
            if (result[0]!.total === 1) {
              await db.update(schema.user).set({ role: 'admin' }).where(eq(schema.user.id, user.id))
              return
            }

            // Check for a pending invitation matching this email
            if (user.email) {
              const [invitation] = await db
                .select()
                .from(schema.invitations)
                .where(and(
                  eq(schema.invitations.email, user.email.toLowerCase()),
                  eq(schema.invitations.status, 'pending'),
                ))
                .limit(1)

              if (invitation && new Date() <= invitation.expiresAt) {
                await db.update(schema.user).set({ role: invitation.role }).where(eq(schema.user.id, user.id))
                await db.update(schema.invitations).set({ status: 'accepted' }).where(eq(schema.invitations.id, invitation.id))
              }
            }
          },
        },
      },
    },
  }
})
