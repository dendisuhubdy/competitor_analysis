import { NextRequest, NextResponse } from 'next/server'
import { createReport } from '@/lib/db'
import { checkRateLimit } from '@/lib/ratelimit'
import { runAnalysis } from '@/lib/analysis/run'

export const runtime = 'nodejs'

const MAX_INPUT = 4000
const MIN_INPUT = 20

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'local'
  )
}

export async function POST(req: NextRequest) {
  let description: unknown
  try {
    description = (await req.json())?.description
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (typeof description !== 'string' || description.trim().length < MIN_INPUT) {
    return NextResponse.json(
      { error: `Describe your company in at least ${MIN_INPUT} characters.` },
      { status: 400 },
    )
  }
  if (description.length > MAX_INPUT) {
    return NextResponse.json(
      { error: `Keep the description under ${MAX_INPUT} characters.` },
      { status: 400 },
    )
  }

  const limit = checkRateLimit(clientIp(req))
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit reached. Try again in an hour.' },
      { status: 429 },
    )
  }

  const trimmed = description.trim()
  const id = createReport(trimmed)

  // Detached on purpose: the run takes 60-120s, far longer than a request
  // should be held open. Progress is persisted to SQLite as it goes, so the
  // client reattaches via the SSE endpoint and a disconnect does not cancel it.
  //
  // DEPLOYMENT NOTE: a floating promise works in a long-lived Node process.
  // On serverless this needs `waitUntil` or a queue.
  void runAnalysis(id, trimmed)

  return NextResponse.json({ id }, { status: 201 })
}
