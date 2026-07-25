'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const EXAMPLE =
  'We build an AI notetaker that produces citation-grade meeting records for law firms. Recordings are transcribed, every claim links back to a timestamp, and output exports to the formats litigation teams already use.'

export default function AnalyzeForm() {
  const router = useRouter()
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ description }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Something went wrong.')
        setSubmitting(false)
        return
      }
      router.push(`/report/${body.id}`)
    } catch {
      setError('Could not reach the server.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-2xl">
      <label
        htmlFor="description"
        className="block text-sm font-medium text-neutral-300"
      >
        Describe your company
      </label>
      <textarea
        id="description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={7}
        maxLength={4000}
        placeholder="What you build, who buys it, and what makes it different."
        className="mt-2 w-full resize-y rounded-lg border border-neutral-700 bg-neutral-900 p-4 text-neutral-100 placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
      />
      <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
        <button
          type="button"
          onClick={() => setDescription(EXAMPLE)}
          className="underline underline-offset-4 hover:text-neutral-300"
        >
          Use an example
        </button>
        <span>{description.length} / 4000</span>
      </div>

      {error && (
        <p className="mt-4 rounded-md border border-red-900 bg-red-950/50 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || description.trim().length < 20}
        className="mt-6 w-full rounded-lg bg-neutral-100 px-5 py-3 font-medium text-neutral-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? 'Starting research…' : 'Run competitor analysis'}
      </button>
      <p className="mt-3 text-center text-xs text-neutral-500">
        Researches the live web. Takes 1–2 minutes.
      </p>
    </form>
  )
}
