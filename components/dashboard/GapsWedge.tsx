import type { Gap, Wedge } from '@/lib/analysis/schema'

export default function GapsWedge({
  gaps,
  wedge,
}: {
  gaps: Gap[]
  wedge: Wedge
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-emerald-900 bg-emerald-950/40 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-400">
          Recommended wedge
        </p>
        <h3 className="mt-2 text-lg font-medium text-neutral-100">
          {wedge.recommendation}
        </h3>
        <p className="mt-2 text-neutral-300">{wedge.rationale}</p>

        <div className="mt-4 rounded-lg border border-emerald-900/70 bg-neutral-950/40 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            First move
          </p>
          <p className="mt-1 text-neutral-200">{wedge.firstMove}</p>
        </div>

        {wedge.risks.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-500">
              Risks
            </p>
            <ul className="mt-1 space-y-1 text-sm text-neutral-400">
              {wedge.risks.map((r) => (
                <li key={r}>· {r}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-neutral-400">Underserved gaps</h3>
        {gaps.length === 0 && (
          <p className="text-neutral-600">No clear gaps were identified.</p>
        )}
        {gaps.map((g) => (
          <div
            key={g.segment}
            className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-5"
          >
            <h4 className="font-medium text-neutral-100">{g.segment}</h4>
            <p className="mt-1 text-neutral-300">{g.unmetNeed}</p>
            <p className="mt-3 text-sm text-neutral-500">
              <span className="text-neutral-400">Why unserved: </span>
              {g.whyUnserved}
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              <span className="text-neutral-400">Evidence: </span>
              {g.evidence}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
