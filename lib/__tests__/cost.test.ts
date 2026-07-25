import { describe, it, expect } from 'vitest'
import { emptyUsage, addUsage, estimateTokenCostUsd } from '@/lib/cost'

describe('cost', () => {
  it('starts at zero', () => {
    const u = emptyUsage()
    expect(u.inputTokens).toBe(0)
    expect(u.estimatedTokenCostUsd).toBe(0)
  })

  it('accumulates across calls and tolerates missing cache fields', () => {
    let u = emptyUsage()
    u = addUsage(u, { input_tokens: 1000, output_tokens: 500 })
    u = addUsage(u, {
      input_tokens: 2000,
      output_tokens: 100,
      cache_read_input_tokens: 300,
    })
    expect(u.inputTokens).toBe(3000)
    expect(u.outputTokens).toBe(600)
    expect(u.cacheReadTokens).toBe(300)
  })

  it('counts web searches separately', () => {
    let u = emptyUsage()
    u = addUsage(u, { input_tokens: 0, output_tokens: 0 }, 4)
    expect(u.webSearches).toBe(4)
  })

  it('prices 1M input + 1M output at $30', () => {
    const cost = estimateTokenCostUsd({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      webSearches: 0,
      estimatedTokenCostUsd: 0,
    })
    expect(cost).toBeCloseTo(30, 5)
  })

  it('prices cache reads at one tenth of input', () => {
    const cost = estimateTokenCostUsd({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
      cacheCreationTokens: 0,
      webSearches: 0,
      estimatedTokenCostUsd: 0,
    })
    expect(cost).toBeCloseTo(0.5, 5)
  })
})
