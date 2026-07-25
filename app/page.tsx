import AnalyzeForm from '@/components/AnalyzeForm'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-6 py-16">
      <div className="mb-10 max-w-2xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-neutral-50">
          Competitor analysis
        </h1>
        <p className="mt-3 text-neutral-400">
          Describe your company. Get a researched, sourced read on who you are
          up against, where the gaps are, and what the market is raising at.
        </p>
      </div>
      <AnalyzeForm />
    </main>
  )
}
