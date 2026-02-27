import { Resend } from 'resend'

let resendClient: Resend | null = null

function getResend(): Resend {
  if (!resendClient) {
    const config = useRuntimeConfig()
    const apiKey = config.email?.resendApiKey
    if (!apiKey) {
      throw createError({
        statusCode: 503,
        message: 'Email service not configured',
        data: { why: 'RESEND_API_KEY is not set', fix: 'Add RESEND_API_KEY to your environment variables' },
      })
    }
    resendClient = new Resend(apiKey)
  }
  return resendClient
}

export async function sendInvitationEmail(options: {
  to: string
  inviteToken: string
  invitedByName: string
  role: string
}) {
  const config = useRuntimeConfig()
  const appUrl = process.env.NUXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000')
  const fromEmail = config.email?.fromEmail || 'noreply@yourdomain.com'
  const inviteUrl = `${appUrl}/login?token=${options.inviteToken}`

  const resend = getResend()

  await resend.emails.send({
    from: fromEmail,
    to: options.to,
    subject: `You're invited to join the Knowledge Agent`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
        <h2 style="font-size: 20px; font-weight: 600; margin-bottom: 16px;">You've been invited</h2>
        <p style="color: #525252; font-size: 14px; line-height: 1.6;">
          <strong>${options.invitedByName}</strong> has invited you to join as a <strong>${options.role}</strong>.
        </p>
        <p style="color: #525252; font-size: 14px; line-height: 1.6;">
          This invitation expires in 48 hours.
        </p>
        <a href="${inviteUrl}" style="display: inline-block; margin-top: 16px; padding: 10px 24px; background: #171717; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">
          Accept Invitation
        </a>
        <p style="margin-top: 24px; color: #a3a3a3; font-size: 12px;">
          If the button doesn't work, copy this URL: ${inviteUrl}
        </p>
      </div>
    `,
  })
}
