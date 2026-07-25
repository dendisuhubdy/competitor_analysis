import { runResearch } from '@/lib/analysis/research'
import { structureReport } from '@/lib/analysis/structure'
import { appendProgress, finishReport, failReport } from '@/lib/db'
import { emptyUsage, type UsageSummary } from '@/lib/cost'

function mergeUsage(a: UsageSummary, b: UsageSummary): UsageSummary {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
    webSearches: a.webSearches + b.webSearches,
    estimatedTokenCostUsd: a.estimatedTokenCostUsd + b.estimatedTokenCostUsd,
  }
}

/**
 * The only module that knows about both phases and the database.
 *
 * Never throws. A failure is a row update, because this runs detached from any
 * request — an unhandled rejection here would take down the process and leave
 * the report stuck in 'running' forever.
 */
export async function runAnalysis(
  reportId: string,
  description: string,
): Promise<void> {
  try {
    appendProgress(reportId, 'research', 'phase', 'Researching the live market')

    const research = await runResearch({
      description,
      // research.ts dedupes before it calls us, so persist faithfully.
      onProgress: (kind, detail) =>
        appendProgress(reportId, 'research', kind, detail),
    })

    appendProgress(
      reportId,
      'structuring',
      'phase',
      research.truncated
        ? 'Research cut short — building report from partial findings'
        : 'Building the dashboard',
    )

    const structured = await structureReport({
      description,
      notes: research.notes,
      truncated: research.truncated,
    })

    const usage = mergeUsage(
      mergeUsage(emptyUsage(), research.usage),
      structured.usage,
    )

    finishReport(reportId, structured.report, usage)
    appendProgress(reportId, 'structuring', 'done', 'Report ready')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    failReport(reportId, message)
    appendProgress(reportId, 'research', 'error', message)
  }
}
