import { NextRequest } from 'next/server'
import { getReport, listProgressSince } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const POLL_MS = 700

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params

  if (!getReport(id)) {
    return new Response('Not found', { status: 404 })
  }

  const encoder = new TextEncoder()
  let lastId = 0
  let timer: ReturnType<typeof setInterval> | null = null
  let closed = false

  const stream = new ReadableStream({
    start(controller) {
      const stop = () => {
        if (closed) return
        closed = true
        if (timer) clearInterval(timer)
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }

      const send = (data: unknown) => {
        if (closed) return
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      const tick = () => {
        if (closed) return
        try {
          // Replays everything since `lastId`, so a reconnecting client that
          // joins mid-run catches up rather than missing the earlier steps.
          for (const ev of listProgressSince(id, lastId)) {
            lastId = ev.id
            send({ type: 'progress', event: ev })
          }

          const row = getReport(id)
          if (row && row.status !== 'running') {
            send({ type: 'status', status: row.status, error: row.error })
            stop()
          }
        } catch {
          stop()
        }
      }

      tick()
      timer = setInterval(tick, POLL_MS)

      req.signal.addEventListener('abort', stop)
    },
    cancel() {
      closed = true
      if (timer) clearInterval(timer)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
