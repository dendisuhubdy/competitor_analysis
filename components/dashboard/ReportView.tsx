import type { Report } from '@/lib/analysis/schema'
import type { UsageSummary } from '@/lib/cost'
import Section from './Section'
import CompetitorCards from './CompetitorCards'
import PositioningMap from './PositioningMap'
import SwotMoat from './SwotMoat'
import GapsWedge from './GapsWedge'
import ValuationPanel from './ValuationPanel'

const CONFIDENCE_STYLE = {
  high: 'border-emerald-900 text-emerald-400',
  medium: 'border-amber-900 text-amber-400',
  low: 'border-rose-900 text-rose-400',
} as const

/**
 * The report dashboard, shared by a stored run at `/report/[id]` and the public
 * fixture at `/sample`. Both must render identically — a sample that diverges
 * from the product is worse than no sample — so there is one component and the
 * pages differ only in what they put in `banner`.
 */
export default function ReportView({
  report: r,
  usage,
  banner,
}: {
  report: Report
  usage?: UsageSummary | null
  banner?: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-5xl">
      {banner}

      <header className="pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-3xl tracking-tight text-neutral-50">
            {r.company.name}
          </h1>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs ${CONFIDENCE_STYLE[r.confidence]}`}
          >
            {r.confidence} confidence
          </span>
        </div>
        <p className="mt-2 text-neutral-400">{r.company.oneLiner}</p>
        <p className="mt-1 text-sm text-neutral-600">
          {r.company.category} · {r.company.inferredStage}
          {usage && (
            <>
              {' '}
              · {usage.webSearches} searches · ~$
              {usage.estimatedTokenCostUsd.toFixed(2)} in tokens
            </>
          )}
        </p>
      </header>

      <Section
        title="Competitors"
        subtitle="Ranked by how directly they compete for your customer."
      >
        <CompetitorCards competitors={r.competitors} />
      </Section>

      <Section
        title="Positioning"
        subtitle="The two dimensions that actually separate this market."
      >
        <PositioningMap positioning={r.positioning} />
      </Section>

      <Section title="SWOT and defensibility">
        <SwotMoat swot={r.swot} moat={r.moat} />
      </Section>

      <Section title="Gaps and wedge">
        <GapsWedge gaps={r.gaps} wedge={r.wedge} />
      </Section>

      <Section
        id="valuation"
        title="Valuation and fundraise"
        subtitle="Every comparable below is sourced. Rounds that could not be sourced were omitted rather than estimated."
      >
        <ValuationPanel valuation={r.valuation} />
      </Section>

      <Section title="Sources">
        <ul className="space-y-1.5 text-sm">
          {r.sources.map((s) => (
            <li key={s.url}>
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="text-neutral-400 underline underline-offset-2 hover:text-neutral-200"
              >
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
