import type { Competitor } from '@/lib/analysis/schema'

const CATEGORY_STYLE: Record<Competitor['category'], string> = {
  direct: 'bg-red-950 text-red-300 border-red-900',
  adjacent: 'bg-amber-950 text-amber-300 border-amber-900',
  emerging: 'bg-sky-950 text-sky-300 border-sky-900',
}

export default function CompetitorCards({
  competitors,
}: {
  competitors: Competitor[]
}) {
  if (competitors.length === 0) {
    return <p className="text-neutral-500">No competitors were identified.</p>
  }

  const sorted = [...competitors].sort((a, b) => b.overlapScore - a.overlapScore)

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {sorted.map((c) => (
        <article
          key={c.name}
          className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-medium text-neutral-100">
                {c.url ? (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline"
                  >
                    {c.name}
                  </a>
                ) : (
                  c.name
                )}
              </h3>
              <p className="mt-1 text-sm text-neutral-400">{c.oneLiner}</p>
            </div>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${CATEGORY_STYLE[c.category]}`}
            >
              {c.category}
            </span>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>Overlap</span>
              <span>{c.overlapScore}</span>
            </div>
            <div className="mt-1 h-1 rounded-full bg-neutral-800">
              <div
                className="h-1 rounded-full bg-neutral-400"
                style={{ width: `${Math.min(100, Math.max(0, c.overlapScore))}%` }}
              />
            </div>
          </div>

          <dl className="mt-4 space-y-1.5 text-sm">
            <Row label="Segment" value={c.targetSegment} />
            <Row
              label="Pricing"
              value={
                c.pricing
                  ? [c.pricing.model, c.pricing.entryPrice].filter(Boolean).join(' · ')
                  : null
              }
            />
            <Row
              label="Raised"
              value={
                c.funding
                  ? [c.funding.totalRaised, c.funding.lastRound]
                      .filter(Boolean)
                      .join(' · ')
                  : null
              }
            />
          </dl>

          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <List title="Strengths" items={c.strengths} tone="text-emerald-400" />
            <List title="Weaknesses" items={c.weaknesses} tone="text-rose-400" />
          </div>

          {c.sources.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-neutral-800 pt-3">
              {c.sources.map((s) => (
                <a
                  key={s.url}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-300"
                >
                  {s.title}
                </a>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-neutral-500">{label}</dt>
      <dd className={value ? 'text-neutral-300' : 'text-neutral-600'}>
        {value || 'Not found'}
      </dd>
    </div>
  )
}

function List({
  title,
  items,
  tone,
}: {
  title: string
  items: string[]
  tone: string
}) {
  return (
    <div>
      <p className={`text-xs font-medium ${tone}`}>{title}</p>
      <ul className="mt-1 space-y-1 text-neutral-400">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  )
}
