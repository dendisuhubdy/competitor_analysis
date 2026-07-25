import Link from 'next/link'
import PositioningMap from '@/components/dashboard/PositioningMap'
import CompetitorCards from '@/components/dashboard/CompetitorCards'
import { sampleReport, sampleStats } from '@/lib/sample'

/** The three most directly competing, by the report's own overlap score. */
const topCompetitors = [...sampleReport.competitors]
  .sort((a, b) => b.overlapScore - a.overlapScore)
  .slice(0, 3)

export default function SampleSlice() {
  return (
    <section className="border-t border-neutral-900">
      <div className="mx-auto w-full max-w-5xl px-6 py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-serif text-3xl leading-tight text-neutral-50 md:text-4xl">
              This is the real output
            </h2>
            <p className="mt-3 max-w-xl text-neutral-400">
              Rendered live from a stored run, by the same components the app
              uses. Not a screenshot.
            </p>
          </div>
          <Link
            href="/sample"
            className="text-sm text-emerald-400 underline underline-offset-4 hover:text-emerald-300"
          >
            Read the whole report →
          </Link>
        </div>

        <div className="mt-10 rounded-2xl border border-neutral-900 bg-neutral-900/20 p-5 md:p-8">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-neutral-600">
            Positioning
          </p>
          <div className="mt-5">
            <PositioningMap positioning={sampleReport.positioning} />
          </div>

          <p className="mt-12 font-mono text-xs uppercase tracking-[0.16em] text-neutral-600">
            Competitors — {topCompetitors.length} of {sampleStats.competitors}
          </p>
          <div className="mt-5">
            <CompetitorCards competitors={topCompetitors} />
          </div>
        </div>
      </div>
    </section>
  )
}
