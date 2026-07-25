'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ProgressEvent } from '@/lib/db'

const LABEL: Record<string, string> = {
  phase: '',
  search: 'Searching',
  fetch: 'Reading',
  thinking: 'Thinking',
  done: 'Done',
  error: 'Failed',
}

export default function RunProgress({ reportId }: { reportId: string }) {
  const router = useRouter()
  const [events, setEvents] = useState<ProgressEvent[]>([])

  useEffect(() => {
    const es = new EventSource(`/api/report/${reportId}/stream`)

    es.onmessage = (msg) => {
      const data = JSON.parse(msg.data)
      if (data.type === 'progress') {
        setEvents((prev) => [...prev, data.event as ProgressEvent])
      } else if (data.type === 'status') {
        es.close()
        // Re-render the server component, which now sees a terminal status.
        router.refresh()
      }
    }

    // The server closes the stream on completion; without this the browser
    // would reconnect in a loop against a finished report.
    es.onerror = () => es.close()

    return () => es.close()
  }, [reportId, router])

  const phase = [...events].reverse().find((e) => e.kind === 'phase')
  const steps = events.filter((e) => e.kind !== 'phase')

  return (
    <div className="mx-auto w-full max-w-2xl py-20">
      <div className="flex items-center gap-3">
        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
        <h2 className="text-lg font-medium text-neutral-100">
          {phase?.detail ?? 'Researching the market'}
        </h2>
      </div>

      <ol className="mt-8 space-y-2">
        {steps.map((e) => (
          <li key={e.id} className="flex gap-3 font-mono text-sm text-neutral-500">
            <span className="w-16 shrink-0 text-neutral-600">{LABEL[e.kind]}</span>
            <span className="truncate text-neutral-400">{e.detail}</span>
          </li>
        ))}
      </ol>

      {steps.length === 0 && (
        <p className="mt-8 text-sm text-neutral-500">Starting up…</p>
      )}
    </div>
  )
}
