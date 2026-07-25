/**
 * Claude Opus 5 pricing, USD per million tokens.
 * Cache reads bill at ~0.1x input; cache writes at ~1.25x input.
 *
 * Web searches are billed separately by Anthropic and are NOT priced here —
 * we count them and label the figure a token cost, rather than inventing a
 * per-search rate.
 */
const INPUT_PER_MTOK = 5
const OUTPUT_PER_MTOK = 25
const CACHE_READ_PER_MTOK = INPUT_PER_MTOK * 0.1
const CACHE_WRITE_PER_MTOK = INPUT_PER_MTOK * 1.25

export interface UsageSummary {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  webSearches: number
  estimatedTokenCostUsd: number
}

/** The subset of the SDK `usage` object we consume. */
export interface RawUsage {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

export function emptyUsage(): UsageSummary {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    webSearches: 0,
    estimatedTokenCostUsd: 0,
  }
}

export function estimateTokenCostUsd(u: UsageSummary): number {
  return (
    (u.inputTokens / 1e6) * INPUT_PER_MTOK +
    (u.outputTokens / 1e6) * OUTPUT_PER_MTOK +
    (u.cacheReadTokens / 1e6) * CACHE_READ_PER_MTOK +
    (u.cacheCreationTokens / 1e6) * CACHE_WRITE_PER_MTOK
  )
}

export function addUsage(
  acc: UsageSummary,
  usage: RawUsage,
  webSearches = 0,
): UsageSummary {
  const next: UsageSummary = {
    inputTokens: acc.inputTokens + (usage.input_tokens ?? 0),
    outputTokens: acc.outputTokens + (usage.output_tokens ?? 0),
    cacheReadTokens: acc.cacheReadTokens + (usage.cache_read_input_tokens ?? 0),
    cacheCreationTokens:
      acc.cacheCreationTokens + (usage.cache_creation_input_tokens ?? 0),
    webSearches: acc.webSearches + webSearches,
    estimatedTokenCostUsd: 0,
  }
  next.estimatedTokenCostUsd = estimateTokenCostUsd(next)
  return next
}
