import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  appendProgress: vi.fn(),
  finishReport: vi.fn(),
  failReport: vi.fn(),
}))
vi.mock('@/lib/analysis/research', () => ({ runResearch: vi.fn() }))
vi.mock('@/lib/analysis/structure', () => ({ structureReport: vi.fn() }))

import { appendProgress, finishReport, failReport } from '@/lib/db'
import { runResearch } from '@/lib/analysis/research'
import { structureReport } from '@/lib/analysis/structure'
import { runAnalysis } from '@/lib/analysis/run'

const usage = {
  inputTokens: 1,
  outputTokens: 1,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  webSearches: 2,
  estimatedTokenCostUsd: 0.01,
}

beforeEach(() => vi.clearAllMocks())

describe('runAnalysis', () => {
  it('runs both phases and finishes the report', async () => {
    vi.mocked(runResearch).mockResolvedValue({
      notes: 'n',
      usage,
      truncated: false,
    })
    vi.mocked(structureReport).mockResolvedValue({
      report: { confidence: 'high' } as never,
      usage,
    })

    await runAnalysis('r1', 'ai notetaker')

    expect(runResearch).toHaveBeenCalledOnce()
    expect(structureReport).toHaveBeenCalledWith(
      expect.objectContaining({ notes: 'n', truncated: false }),
    )
    expect(finishReport).toHaveBeenCalledWith(
      'r1',
      { confidence: 'high' },
      expect.objectContaining({ webSearches: 4 }), // usage summed across phases
    )
    expect(failReport).not.toHaveBeenCalled()
  })

  it('records a failure instead of throwing', async () => {
    vi.mocked(runResearch).mockRejectedValue(new Error('boom'))
    await expect(runAnalysis('r2', 'x')).resolves.toBeUndefined()
    expect(failReport).toHaveBeenCalledWith('r2', expect.stringContaining('boom'))
    expect(finishReport).not.toHaveBeenCalled()
  })

  it('writes phase markers as progress', async () => {
    vi.mocked(runResearch).mockResolvedValue({ notes: 'n', usage, truncated: false })
    vi.mocked(structureReport).mockResolvedValue({
      report: {} as never,
      usage,
    })
    await runAnalysis('r3', 'x')
    const kinds = vi.mocked(appendProgress).mock.calls.map((c) => c[2])
    expect(kinds).toContain('phase')
    expect(kinds).toContain('done')
  })

  it('persists each progress event research reports', async () => {
    // Dedupe is research.ts's job (it emits from both the live stream handler
    // and a backstop scan). run.ts persists faithfully.
    vi.mocked(runResearch).mockImplementation(async ({ onProgress }) => {
      onProgress('search', 'rival pricing')
      onProgress('fetch', 'https://rival.com/pricing')
      return { notes: 'n', usage, truncated: false }
    })
    vi.mocked(structureReport).mockResolvedValue({ report: {} as never, usage })

    await runAnalysis('r4', 'x')

    const calls = vi.mocked(appendProgress).mock.calls
    expect(calls).toContainEqual(['r4', 'research', 'search', 'rival pricing'])
    expect(calls).toContainEqual([
      'r4',
      'research',
      'fetch',
      'https://rival.com/pricing',
    ])
  })

  it('marks the structuring phase when research was truncated', async () => {
    vi.mocked(runResearch).mockResolvedValue({ notes: 'n', usage, truncated: true })
    vi.mocked(structureReport).mockResolvedValue({ report: {} as never, usage })

    await runAnalysis('r5', 'x')

    expect(structureReport).toHaveBeenCalledWith(
      expect.objectContaining({ truncated: true }),
    )
    const details = vi.mocked(appendProgress).mock.calls.map((c) => c[3])
    expect(details.join(' ')).toMatch(/cut short/i)
  })
})
