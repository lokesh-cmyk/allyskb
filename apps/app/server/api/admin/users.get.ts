import { db, schema } from '@nuxthub/db'
import { count, desc, eq, max, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const requestLog = useLogger(event)
  await requireAdmin(event)

  // Fetch users first (critical), then stats with SQL aggregation
  const users = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      image: schema.user.image,
      role: schema.user.role,
      createdAt: schema.user.createdAt,
    })
    .from(schema.user)
    .orderBy(desc(schema.user.createdAt))

  requestLog.set({ userCount: users.length })

  // Stats are best-effort — return users even if stats fail
  let chatStatsMap = new Map<string, { chatCount: number, lastChatAt: Date | null }>()
  let messageStatsMap = new Map<string, { messageCount: number, lastMessageAt: Date | null }>()

  try {
    const [chatStats, messageStats] = await Promise.all([
      db
        .select({
          userId: schema.chats.userId,
          chatCount: count(schema.chats.id),
          lastChatAt: max(schema.chats.createdAt),
        })
        .from(schema.chats)
        .groupBy(schema.chats.userId),
      db
        .select({
          userId: schema.chats.userId,
          messageCount: count(schema.messages.id),
          lastMessageAt: max(schema.messages.createdAt),
        })
        .from(schema.messages)
        .innerJoin(schema.chats, eq(schema.messages.chatId, schema.chats.id))
        .groupBy(schema.chats.userId),
    ])

    chatStatsMap = new Map(chatStats.map(s => [s.userId, s]))
    messageStatsMap = new Map(messageStats.map(s => [s.userId, s]))
  } catch (error) {
    console.error('[admin/users] Failed to fetch stats:', error)
  }

  return users.map((user) => {
    const chat = chatStatsMap.get(user.id)
    const msg = messageStatsMap.get(user.id)
    const lastChatAt = chat?.lastChatAt ? new Date(chat.lastChatAt) : null
    const lastMsgAt = msg?.lastMessageAt ? new Date(msg.lastMessageAt) : null
    const lastSeenAt = lastChatAt && lastMsgAt
      ? (lastMsgAt > lastChatAt ? lastMsgAt : lastChatAt)
      : lastChatAt || lastMsgAt

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: user.role ?? 'user',
      createdAt: user.createdAt,
      chatCount: chat?.chatCount ?? 0,
      messageCount: msg?.messageCount ?? 0,
      lastSeenAt,
    }
  })
})
