import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

let dbPath: string

beforeEach(() => {
  dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ca-')), 'test.db')
  process.env.DATABASE_PATH = dbPath
})

afterEach(async () => {
  const { closeDb } = await import('@/lib/db')
  closeDb()
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true })
})

async function freshDb() {
  // Reset the module-level handle so each test gets a database at the new
  // DATABASE_PATH rather than reusing the previous test's connection.
  const { resetDbForTests, ...rest } = await import('@/lib/db')
  resetDbForTests()
  return rest
}

describe('report repository', () => {
  it('creates a running report and reads it back', async () => {
    const db = await freshDb()
    const id = db.createReport('an AI notetaker for lawyers')
    const row = db.getReport(id)
    expect(row).not.toBeNull()
    expect(row!.status).toBe('running')
    expect(row!.input).toBe('an AI notetaker for lawyers')
    expect(row!.payload).toBeNull()
  })

  it('returns null for an unknown id', async () => {
    const db = await freshDb()
    expect(db.getReport('nope')).toBeNull()
  })

  it('appends progress and lists it incrementally', async () => {
    const db = await freshDb()
    const id = db.createReport('x')
    db.appendProgress(id, 'research', 'search', 'competitors to acme')
    db.appendProgress(id, 'research', 'fetch', 'https://rival.com/pricing')

    const all = db.listProgressSince(id, 0)
    expect(all).toHaveLength(2)
    expect(all[0].detail).toBe('competitors to acme')

    const tail = db.listProgressSince(id, all[0].id)
    expect(tail).toHaveLength(1)
    expect(tail[0].kind).toBe('fetch')
  })

  it('round-trips a finished payload as parsed JSON', async () => {
    const db = await freshDb()
    const id = db.createReport('x')
    const payload = { confidence: 'high' } as never
    const usage = {
      inputTokens: 10,
      outputTokens: 2,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      webSearches: 1,
      estimatedTokenCostUsd: 0.001,
    }
    db.finishReport(id, payload, usage)

    const row = db.getReport(id)!
    expect(row.status).toBe('done')
    expect(row.payload).toEqual({ confidence: 'high' })
    expect(row.usage!.webSearches).toBe(1)
    expect(row.completedAt).toBeTypeOf('number')
  })

  it('records a failure with its message', async () => {
    const db = await freshDb()
    const id = db.createReport('x')
    db.failReport(id, 'refused: cyber')
    const row = db.getReport(id)!
    expect(row.status).toBe('failed')
    expect(row.error).toBe('refused: cyber')
  })

  it('counts rate limit hits only inside the window', async () => {
    const db = await freshDb()
    db.recordRateLimitHit('1.2.3.4')
    db.recordRateLimitHit('1.2.3.4')
    db.recordRateLimitHit('5.6.7.8')

    expect(db.countRateLimitHits('1.2.3.4', Date.now() - 1000)).toBe(2)
    expect(db.countRateLimitHits('1.2.3.4', Date.now() + 1000)).toBe(0)
    expect(db.countRateLimitHits('9.9.9.9', Date.now() - 1000)).toBe(0)
  })
})
