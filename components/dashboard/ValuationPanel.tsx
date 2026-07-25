import { MIN_COMPARABLES_FOR_RANGE, type Valuation } from '@/lib/analysis/schema'

/**
 * A missing number renders as "Not disclosed", never as 0 or an em dash that
 * could be mistaken for a value. Exported for testing.
 */
export function formatUsd(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return 'Not disclosed'
  if (Math.abs(n) >= 1e9) return `$${trim(n / 1e9)}B`
  if (Math.abs(n) >= 1e6) return `$${trim(n / 1e6)}M`
  if (Math.abs(n) >= 1e3) return `$${trim(n / 1e3)}K`
  return `$${trim(n)}`
}

function trim(n: number): string {
  const rounded = Math.round(n * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export default function ValuationPanel({ valuation }: { valuation: Valuation }) {
  const { comparables, impliedRange, fundraiseGuidance, caveats } = valuation

  return (
    <div className="space-y-6">
      {impliedRange ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Implied valuation range
          </p>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="text-3xl font-semibold text-neutral-100">
              {formatUsd(impliedRange.low)}
            </span>
            <span className="text-neutral-600">to</span>
            <span className="text-3xl font-semibold text-neutral-100">
              {formatUsd(impliedRange.high)}
            </span>
          </div>
          <p className="mt-1 text-sm text-neutral-400">
            Midpoint {formatUsd(impliedRange.mid)} · {impliedRange.currency}
          </p>
          <p className="mt-3 border-t border-neutral-800 pt-3 text-sm text-neutral-400">
            <span className="text-neutral-500">Basis: </span>
            {impliedRange.basis}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-900 bg-amber-950/40 p-6">
          <p className="text-sm font-medium text-amber-300">
            No implied range reported
          </p>
          <p className="mt-2 text-sm text-neutral-300">
            Fewer than {MIN_COMPARABLES_FOR_RANGE} sourced comparables were
            found, so a valuation range is not supportable from this evidence.
            The comparables below are what research actually turned up.
          </p>
        </div>
      )}

      <div>
        <h3 className="text-sm font-medium text-neutral-400">
          Comparable rounds ({comparables.length})
        </h3>
        {comparables.length === 0 ? (
          <p className="mt-2 text-neutral-600">
            No sourced comparable rounds were found.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-xl border border-neutral-800">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="bg-neutral-900 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="p-3 font-medium">Company</th>
                  <th className="p-3 font-medium">Stage</th>
                  <th className="p-3 font-medium">Raised</th>
                  <th className="p-3 font-medium">Post-money</th>
                  <th className="p-3 font-medium">Date</th>
                  <th className="p-3 font-medium">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {comparables.map((c) => (
                  <tr key={`${c.company}-${c.date}`} className="text-neutral-300">
                    <td className="p-3 font-medium text-neutral-100">{c.company}</td>
                    <td className="p-3">{c.roundStage}</td>
                    <td className="p-3">{formatUsd(c.amountRaised)}</td>
                    <td className="p-3">{formatUsd(c.postMoneyValuation)}</td>
                    <td className="p-3 text-neutral-500">{c.date}</td>
                    <td className="p-3">
                      <a
                        href={c.source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-neutral-400 underline underline-offset-2 hover:text-neutral-200"
                      >
                        {c.source.title}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Fundraise guidance
        </p>
        <p className="mt-2 text-lg text-neutral-100">
          {fundraiseGuidance.suggestedRaise}{' '}
          <span className="text-neutral-500">
            at {fundraiseGuidance.suggestedStage}
          </span>
        </p>
        {fundraiseGuidance.keyMetricsToHit.length > 0 && (
          <>
            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-neutral-500">
              Metrics to hit first
            </p>
            <ul className="mt-1 space-y-1 text-sm text-neutral-300">
              {fundraiseGuidance.keyMetricsToHit.map((m) => (
                <li key={m}>· {m}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      {caveats.length > 0 && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Caveats
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-neutral-400">
            {caveats.map((c) => (
              <li key={c}>· {c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
