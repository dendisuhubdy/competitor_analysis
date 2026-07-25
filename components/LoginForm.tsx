'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        setError(body.error ?? 'Could not sign in.')
        setPending(false)
        return
      }

      // Only accept a same-origin relative path — a raw `next` value would let
      // a crafted link bounce an authenticated visitor to another site.
      // With no usable `next`, land on the app rather than the public page they
      // have already read.
      const next = params.get('next')
      const target = next && next.startsWith('/') && !next.startsWith('//')
        ? next
        : '/analyze'

      router.replace(target)
      router.refresh()
    } catch {
      setError('Could not reach the server.')
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm">
      <label htmlFor="password" className="block text-sm font-medium text-neutral-300">
        Password
      </label>
      <input
        id="password"
        type="password"
        autoFocus
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-neutral-100 placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
      />

      {error && (
        <div className="mt-4 rounded-md border border-red-900 bg-red-950/50 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending || password.length === 0}
        className="mt-6 w-full rounded-lg bg-neutral-100 px-5 py-3 font-medium text-neutral-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? 'Checking…' : 'Continue'}
      </button>
    </form>
  )
}
