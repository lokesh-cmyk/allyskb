# Invite-Only Registration System — Design

## Summary

Replace open registration with an invite-only system. Admins create invitations from the dashboard, users receive an email (via Resend) with a signup link. Also fix the `/api/snapshot/status` 500 error.

## Decisions

- **Approach**: Custom invitations table + API (not Better Auth organization plugin)
- **Email provider**: Resend
- **Invite expiry**: 48 hours
- **Registration mode**: Closed — signup only with valid invite token

## Database

New `invitations` table:

| Column | Type | Notes |
|--------|------|-------|
| id | text (UUID) | Primary key |
| email | text | Invited email, not null |
| role | text (user/admin) | Pre-assigned role, default 'user' |
| token | text | Unique invite token |
| status | text (pending/accepted/expired) | Default 'pending' |
| invitedBy | text | FK to user.id |
| expiresAt | timestamp | createdAt + 48h |
| createdAt | timestamp | Default now |

Indexes: unique on `token`, index on `email`.

## API Routes

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | /api/admin/invitations | Admin | List all invitations |
| POST | /api/admin/invitations | Admin | Create + send email |
| DELETE | /api/admin/invitations/[id] | Admin | Revoke invitation |
| POST | /api/admin/invitations/[id]/resend | Admin | Resend email |
| GET | /api/invitations/validate?token=xxx | Public | Validate token |

## Login Page Changes

- Hide "Sign up" toggle by default
- Show signup form only when `?token=xxx` is present and valid
- Pre-fill email from invitation (read-only)
- On successful signup: assign invited role, mark invitation as accepted
- Show clear error for expired/invalid/used tokens

## Admin UI

On `/admin/users` page:
- Add "Invite User" button in header
- Modal with email input + role dropdown
- Invitations table section below users showing pending/accepted invitations

## Email (Resend)

- Install `resend` package
- Env var: `RESEND_API_KEY`
- Simple HTML email with invite link to `/login?token=xxx`
- From: configurable via `RESEND_FROM_EMAIL` env var

## Snapshot Status Fix

- Wrap `Snapshot.list()` and related calls in try-catch
- Return safe fallback when API is unavailable
- Log error for debugging
