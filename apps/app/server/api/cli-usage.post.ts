import { z } from 'zod'
import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

const bodySchema = z.object({
  sessionId: z.string().min(1).max(200),
  project: z.string().max(200).nullish(),
  model: z.string().max(100).nullish(),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  turns: z.number().int().nonnegative().default(0),
  toolCalls: z.number().int().nonnegative().default(0),
  durationMs: z.number().int().nonnegative().nullish(),
  startedAt: z.string().nullish(),
  lastActiveAt: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const body = await readValidatedBody(event, bodySchema.parse)

  const existing = await db
    .select({ id: schema.cliUsage.id })
    .from(schema.cliUsage)
    .where(eq(schema.cliUsage.sessionId, body.sessionId))
    .limit(1)

  if (existing.length > 0) {
    await db.update(schema.cliUsage).set({
      model: body.model ?? undefined,
      inputTokens: body.inputTokens,
      outputTokens: body.outputTokens,
      turns: body.turns,
      toolCalls: body.toolCalls,
      durationMs: body.durationMs ?? undefined,
      lastActiveAt: body.lastActiveAt ? new Date(body.lastActiveAt) : new Date(),
      metadata: body.metadata ?? undefined,
      updatedAt: new Date(),
    }).where(eq(schema.cliUsage.id, existing[0]!.id))

    return { ok: true, action: 'updated' }
  }

  await db.insert(schema.cliUsage).values({
    userId: user.id,
    sessionId: body.sessionId,
    project: body.project ?? undefined,
    model: body.model ?? undefined,
    inputTokens: body.inputTokens,
    outputTokens: body.outputTokens,
    turns: body.turns,
    toolCalls: body.toolCalls,
    durationMs: body.durationMs ?? undefined,
    startedAt: body.startedAt ? new Date(body.startedAt) : new Date(),
    lastActiveAt: body.lastActiveAt ? new Date(body.lastActiveAt) : new Date(),
    metadata: body.metadata ?? undefined,
  })

  return { ok: true, action: 'created' }
})
