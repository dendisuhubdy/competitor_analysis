import { notFound } from 'next/navigation'
import { getReport } from '@/lib/db'
import RunProgress from '@/components/RunProgress'
import Section from '@/components/dashboard/Section'
import CompetitorCards from '@/components/dashboard/CompetitorCards'
import PositioningMap from '@/components/dashboard/PositioningMap'
import SwotMoat from '@/components/dashboard/SwotMoat'
import GapsWedge from '@/components/dashboard/GapsWedge'
import ValuationPanel from '@/components/dashboard/ValuationPanel'

export const dynamic = 'force-dynamic'

const CONFIDENCE_STYLE = {
  high: 'border-emerald-900 text-emerald-400',
  medium: 'border-amber-900 text-amber-400',
  low: 'border-rose-900 text-rose-400',
} as const

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const row = getReport(id)
  if (!row) notFound()

  if (row.status === 'running') {
    return (
      <main className="min-h-screen bg-neutral-950 px-6">
        <RunProgress reportId={id} />
      </main>
    )
  }

  if (row.status === 'failed' || !row.payload) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-6">
        <div className="max-w-lg text-center">
          <h1 className="text-xl font-medium text-neutral-100">
            This analysis did not finish
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            {row.error ?? 'The run ended without producing a report.'}
          </p>
          <a
            href="/"
            className="mt-6 inline-block rounded-lg bg-neutral-100 px-5 py-2.5 font-medium text-neutral-900 hover:bg-white"
          >
            Start over
          </a>
        </div>
      </main>
    )
  }

  const r = row.payload

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <header className="pb-6">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-50">
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
            {row.usage && (
              <>
                {' '}
                · {row.usage.webSearches} searches · ~$
                {row.usage.estimatedTokenCostUsd.toFixed(2)} in tokens
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
    </main>
  )
}
