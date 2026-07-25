import { notFound } from 'next/navigation'
import { getReport } from '@/lib/db'
import RunProgress from '@/components/RunProgress'
import ReportView from '@/components/dashboard/ReportView'

export const dynamic = 'force-dynamic'

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
            href="/analyze"
            className="mt-6 inline-block rounded-lg bg-neutral-100 px-5 py-2.5 font-medium text-neutral-900 hover:bg-white"
          >
            Start over
          </a>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-12">
      <ReportView report={row.payload} usage={row.usage} />
    </main>
  )
}
