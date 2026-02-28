import { db, schema } from '@nuxthub/db'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import type { CliUsageResponse } from '#shared/types/stats'

export default defineEventHandler(async (event): Promise<CliUsageResponse> => {
  await requireAdmin(event)

  const query = getQuery(event)
  const days = Math.min(Math.max(Number(query.days) || 30, 1), 365)
  const userId = query.userId as string | undefined

  const from = new Date()
  from.setDate(from.getDate() - days)
  from.setHours(0, 0, 0, 0)

  const to = new Date()
  to.setHours(23, 59, 59, 999)

  const conditions = [gte(schema.cliUsage.createdAt, from)]
  if (userId) conditions.push(eq(schema.cliUsage.userId, userId))

  const records = await db
    .select()
    .from(schema.cliUsage)
    .where(and(...conditions))
    .orderBy(desc(schema.cliUsage.lastActiveAt))

  // Fetch user info
  const userIds = [...new Set(records.map(r => r.userId))]
  const users = userIds.length > 0
    ? await db.select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        image: schema.user.image,
      }).from(schema.user).where(
        sql`${schema.user.id} IN ${userIds}`,
      )
    : []
  const userMap = new Map(users.map(u => [u.id, u]))

  // Aggregate by user
  const byUserMap = new Map<string, {
    sessions: number
    turns: number
    inputTokens: number
    outputTokens: number
    lastActiveAt: Date | null
  }>()

  for (const r of records) {
    const existing = byUserMap.get(r.userId) ?? {
      sessions: 0, turns: 0, inputTokens: 0, outputTokens: 0, lastActiveAt: null,
    }
    existing.sessions++
    existing.turns += r.turns
    existing.inputTokens += r.inputTokens
    existing.outputTokens += r.outputTokens
    if (!existing.lastActiveAt || (r.lastActiveAt && r.lastActiveAt > existing.lastActiveAt)) {
      existing.lastActiveAt = r.lastActiveAt
    }
    byUserMap.set(r.userId, existing)
  }

  // Get pricing for cost estimation
  const pricingMap = await getModelPricingMap()

  // Aggregate by model
  const byModelMap = new Map<string, { sessions: number, inputTokens: number, outputTokens: number }>()
  for (const r of records) {
    const model = r.model || 'unknown'
    const existing = byModelMap.get(model) ?? { sessions: 0, inputTokens: 0, outputTokens: 0 }
    existing.sessions++
    existing.inputTokens += r.inputTokens
    existing.outputTokens += r.outputTokens
    byModelMap.set(model, existing)
  }

  // Aggregate daily
  const dailyMap = new Map<string, { sessions: number, inputTokens: number, outputTokens: number, turns: number }>()
  for (const r of records) {
    const date = (r.startedAt ?? r.createdAt).toISOString().slice(0, 10)
    const existing = dailyMap.get(date) ?? { sessions: 0, inputTokens: 0, outputTokens: 0, turns: 0 }
    existing.sessions++
    existing.inputTokens += r.inputTokens
    existing.outputTokens += r.outputTokens
    existing.turns += r.turns
    dailyMap.set(date, existing)
  }

  // Zero-fill daily data
  const daily = []
  const cursor = new Date(from)
  while (cursor <= to) {
    const dateStr = cursor.toISOString().slice(0, 10)
    const d = dailyMap.get(dateStr)
    daily.push({
      date: dateStr,
      sessions: d?.sessions ?? 0,
      inputTokens: d?.inputTokens ?? 0,
      outputTokens: d?.outputTokens ?? 0,
      turns: d?.turns ?? 0,
    })
    cursor.setDate(cursor.getDate() + 1)
  }

  // Compute totals
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalTurns = 0
  let totalEstimatedCost = 0
  for (const r of records) {
    totalInputTokens += r.inputTokens
    totalOutputTokens += r.outputTokens
    totalTurns += r.turns
  }

  // Compute costs by model
  const byModel = Array.from(byModelMap.entries()).map(([model, data]) => {
    const pricing = pricingMap[model]
    const totalCost = pricing
      ? (data.inputTokens * pricing.input) + (data.outputTokens * pricing.output)
      : 0
    totalEstimatedCost += totalCost
    return { model, sessions: data.sessions, inputTokens: data.inputTokens, outputTokens: data.outputTokens, totalCost }
  }).sort((a, b) => (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens))

  // Build per-user stats with costs
  const grandTotal = totalInputTokens + totalOutputTokens
  const byUser = Array.from(byUserMap.entries()).map(([uid, data]) => {
    const u = userMap.get(uid)
    const userTotalTokens = data.inputTokens + data.outputTokens
    const userCost = grandTotal > 0 && totalEstimatedCost > 0
      ? (userTotalTokens / grandTotal) * totalEstimatedCost
      : 0
    return {
      userId: uid,
      name: u?.name ?? 'Unknown',
      email: u?.email ?? '',
      image: u?.image ?? null,
      sessions: data.sessions,
      turns: data.turns,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      totalTokens: userTotalTokens,
      estimatedCost: userCost,
      lastActiveAt: data.lastActiveAt?.toISOString() ?? null,
    }
  }).sort((a, b) => b.totalTokens - a.totalTokens)

  return {
    period: { days, from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
    totals: {
      sessions: records.length,
      turns: totalTurns,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      activeUsers: byUserMap.size,
      estimatedCost: totalEstimatedCost,
    },
    byUser,
    daily,
    byModel,
  }
})
