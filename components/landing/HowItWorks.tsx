const STEPS = [
  {
    n: '01',
    title: 'Research the live web',
    body: 'Claude Opus 5 runs with extended thinking and server-side web search and fetch, issuing real queries against the current web rather than recalling training data. A run makes around twenty searches and reads the pages it finds.',
  },
  {
    n: '02',
    title: 'Structure against a schema',
    body: 'The research notes are reshaped into a schema-validated payload across three constrained calls — landscape, strategy, valuation. A comparable without a source URL cannot survive validation, so the integrity rules are enforced by the type system rather than requested in a prompt.',
  },
  {
    n: '03',
    title: 'Watch it happen',
    body: 'Progress is persisted as the run proceeds, so the report page streams the actual search queries being issued and survives a refresh. Closing the tab does not cancel the run.',
  },
]

const CONTENTS = [
  [
    'Competitors',
    'Direct, adjacent and emerging, each scored for how directly it competes for your customer.',
  ],
  [
    'Positioning',
    'The two dimensions that genuinely separate the market, with you plotted against everyone else.',
  ],
  [
    'SWOT and moat',
    'A defensibility verdict that is willing to say "weak" and explain why.',
  ],
  ['Gaps', 'Segments nobody serves, with the evidence that they are unserved.'],
  [
    'Wedge',
    'One recommended way in, the reasoning behind it, and the first move.',
  ],
  [
    'Valuation',
    'Sourced comparable rounds, and a range only when the comparables support one.',
  ],
] as const

export default function HowItWorks() {
  return (
    <section className="border-t border-neutral-900">
      <div className="mx-auto w-full max-w-5xl px-6 py-24">
        <h2 className="font-serif text-3xl leading-tight text-neutral-50 md:text-4xl">
          How a report gets made
        </h2>

        <div className="mt-12 space-y-px">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="grid gap-4 border-t border-neutral-900 py-8 md:grid-cols-[4rem_1fr_2fr] md:gap-8"
            >
              <span className="font-mono text-sm text-emerald-600">{s.n}</span>
              <h3 className="font-serif text-xl text-neutral-100">{s.title}</h3>
              <p className="leading-relaxed text-neutral-400">{s.body}</p>
            </div>
          ))}
        </div>

        <h3 className="mt-20 font-serif text-2xl text-neutral-50">
          What is in a report
        </h3>
        <dl className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {CONTENTS.map(([term, description]) => (
            <div key={term} className="border-t border-neutral-800 pt-4">
              <dt className="text-sm font-medium text-neutral-100">{term}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-neutral-500">
                {description}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
