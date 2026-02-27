export const COMPOSIO_TOOLKIT_SLUGS = [process.env.COMPOSIO_TOOLKIT_SLUG || 'googlesuper']

/** Google services available through the Google Super toolkit via Composio MCP */
export const GOOGLE_TOOL_CATEGORIES = {
  gmail: 'Send, read, search, draft, label, and manage emails and threads',
  calendar: 'Create, list, update, delete events; manage calendars and availability',
  drive: 'Create, copy, move, share, and search files and folders; manage permissions',
  sheets: 'Create, read, update spreadsheets; manage sheets, charts, filters, and cell data',
  docs: 'Create, read, and update documents',
  contacts: 'Search, create, update, and manage contacts',
  tasks: 'Create, list, update, and manage tasks and task lists',
  photos: 'Search photos, create albums, manage media items',
  maps: 'Compute routes, directions, and route matrices',
  analytics: 'Run reports, manage properties, audiences, and data streams',
} as const

export type GoogleToolCategory = keyof typeof GOOGLE_TOOL_CATEGORIES

export const COMPOSIO_KV_KEYS = {
  session: (userId: string) => `composio:session:${userId}`,
} as const

export const COMPOSIO_SESSION_TTL = 60 * 30 // 30 minutes

export interface ComposioSessionCache {
  url: string
  headers: Record<string, string>
  expiresAt: number
}
