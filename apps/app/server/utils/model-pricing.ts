interface ModelPricing {
  input: number // cost per token in USD
  output: number
}

type PricingRecord = Record<string, ModelPricing>

export const getModelPricingMap = defineCachedFunction(
  async (): Promise<PricingRecord> => {
    try {
      const apiKey = process.env.OPENROUTER_API_KEY
      if (!apiKey) return {}

      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!res.ok) return {}

      const { data } = await res.json() as { data: Array<{ id: string, pricing?: { prompt: string, completion: string } }> }
      const pricing: PricingRecord = {}
      for (const model of data) {
        if (model.pricing) {
          pricing[model.id] = {
            input: parseFloat(model.pricing.prompt),
            output: parseFloat(model.pricing.completion),
          }
        }
      }
      return pricing
    } catch {
      return {}
    }
  },
  {
    maxAge: 3600,
    swr: true,
    name: 'model-pricing',
    getKey: () => 'v1',
  },
)

export function computeEstimatedCost(
  byModel: Array<{ model: string, inputTokens: number, outputTokens: number }>,
  pricingMap: PricingRecord,
) {
  const byModelCosts = byModel.map((m) => {
    const pricing = pricingMap[m.model]
    if (!pricing) return { model: m.model, inputCost: 0, outputCost: 0, totalCost: 0 }
    const inputCost = m.inputTokens * pricing.input
    const outputCost = m.outputTokens * pricing.output
    return { model: m.model, inputCost, outputCost, totalCost: inputCost + outputCost }
  })

  return {
    total: byModelCosts.reduce((sum, m) => sum + m.totalCost, 0),
    byModel: byModelCosts,
  }
}
