import type { Swot, Moat } from '@/lib/analysis/schema'

const VERDICT_STYLE: Record<Moat['verdict'], string> = {
  strong: 'border-emerald-800 bg-emerald-950/60 text-emerald-300',
  emerging: 'border-sky-800 bg-sky-950/60 text-sky-300',
  weak: 'border-amber-800 bg-amber-950/60 text-amber-300',
  none: 'border-rose-800 bg-rose-950/60 text-rose-300',
}

const VERDICT_COPY: Record<Moat['verdict'], string> = {
  strong: 'Defensible moat',
  emerging: 'Moat forming',
  weak: 'Thin moat',
  none: 'Commodity fight',
}

export default function SwotMoat({ swot, moat }: { swot: Swot; moat: Moat }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Quadrant title="Strengths" items={swot.strengths} tone="text-emerald-400" />
        <Quadrant title="Weaknesses" items={swot.weaknesses} tone="text-rose-400" />
        <Quadrant
          title="Opportunities"
          items={swot.opportunities}
          tone="text-sky-400"
        />
        <Quadrant title="Threats" items={swot.threats} tone="text-amber-400" />
      </div>

      <div className={`rounded-xl border p-5 ${VERDICT_STYLE[moat.verdict]}`}>
        <p className="text-sm font-medium uppercase tracking-wide">
          {VERDICT_COPY[moat.verdict]}
        </p>
        <p className="mt-2 text-neutral-200">{moat.reasoning}</p>
        {moat.defensibilityFactors.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-neutral-300">
            {moat.defensibilityFactors.map((f) => (
              <li key={f}>· {f}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Quadrant({
  title,
  items,
  tone,
}: {
  title: string
  items: string[]
  tone: string
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
      <h3 className={`text-sm font-medium ${tone}`}>{title}</h3>
      <ul className="mt-2 space-y-1.5 text-sm text-neutral-300">
        {items.length === 0 && <li className="text-neutral-600">Nothing found.</li>}
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  )
}
