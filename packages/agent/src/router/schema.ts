import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'

export const ROUTER_MODEL = 'google/gemini-2.5-flash-lite'
export const DEFAULT_MODEL = 'google/gemini-2.5-flash'

function createProvider() {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set')
  return createOpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
  })
}

export function getModel(modelId: string) {
  return createProvider().chat(modelId)
}

export const agentConfigSchema = z.object({
  complexity: z.enum(['trivial', 'simple', 'moderate', 'complex'])
    .describe('trivial=greeting, simple=single lookup, moderate=multi-search, complex=deep analysis'),

  maxSteps: z.number().min(1).max(30)
    .describe('Agent iterations: 4 trivial, 8 simple, 15 moderate, 25 complex'),

  model: z.enum([
    'google/gemini-2.5-flash',
    'anthropic/claude-sonnet-4-6',
    'anthropic/claude-opus-4-6',
  ]).describe('flash for trivial/simple, sonnet for moderate, opus for complex'),

  reasoning: z.string().max(200)
    .describe('Brief explanation of the classification'),
})

export type AgentConfig = z.infer<typeof agentConfigSchema>

export function getDefaultConfig(): AgentConfig {
  return {
    complexity: 'moderate',
    maxSteps: 15,
    model: 'anthropic/claude-sonnet-4-6',
    reasoning: 'Default fallback configuration',
  }
}
