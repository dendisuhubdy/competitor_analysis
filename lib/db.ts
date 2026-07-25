import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { nanoid } from 'nanoid'
import type { Report } from '@/lib/analysis/schema'
import type { UsageSummary } from '@/lib/cost'

/**
 * The ONLY module in the app that issues SQL. Everything else goes through
 * these functions.
 *
 * DEPLOYMENT NOTE: better-sqlite3 writes to the local filesystem, which is
 * ephemeral on serverless platforms such as Vercel. To deploy, swap the
 * `Database` construction below for a Turso/libSQL client (same SQL dialect)
 * or Postgres. Because no SQL exists outside this file, that is a one-file
 * change.
 */

export type ReportStatus = 'running' | 'done' | 'failed'
export type Phase = 'research' | 'structuring'
export type ProgressKind =
  | 'phase'
  | 'search'
  | 'fetch'
  | 'thinking'
  | 'done'
  | 'error'

export interface ReportRow {
  id: string
  input: string
  status: ReportStatus
  payload: Report | null
  error: string | null
  usage: UsageSummary | null
  createdAt: number
  completedAt: number | null
}

export interface ProgressEvent {
  id: number
  reportId: string
  phase: Phase
  kind: ProgressKind
  detail: string
  createdAt: number
}

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db
  const file = process.env.DATABASE_PATH ?? './data/reports.db'
  fs.mkdirSync(path.dirname(file), { recursive: true })
  db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id           TEXT PRIMARY KEY,
      input        TEXT NOT NULL,
      status       TEXT NOT NULL,
      payload      TEXT,
      error        TEXT,
      usage        TEXT,
      created_at   INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS progress_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id  TEXT NOT NULL REFERENCES reports(id),
      phase      TEXT NOT NULL,
      kind       TEXT NOT NULL,
      detail     TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_progress_report
      ON progress_events(report_id, id);
    CREATE TABLE IF NOT EXISTS rate_limits (
      ip         TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rate_limits_ip
      ON rate_limits(ip, created_at);
  `)
  return db
}

export function closeDb(): void {
  db?.close()
  db = null
}

/** Test-only: forget the cached handle so a new DATABASE_PATH takes effect. */
export function resetDbForTests(): void {
  db = null
}

export function createReport(input: string): string {
  const id = nanoid(12)
  getDb()
    .prepare(
      `INSERT INTO reports (id, input, status, created_at)
       VALUES (?, ?, 'running', ?)`,
    )
    .run(id, input, Date.now())
  return id
}

export function appendProgress(
  reportId: string,
  phase: Phase,
  kind: ProgressKind,
  detail: string,
): void {
  getDb()
    .prepare(
      `INSERT INTO progress_events (report_id, phase, kind, detail, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(reportId, phase, kind, detail, Date.now())
}

export function getReport(id: string): ReportRow | null {
  const row = getDb()
    .prepare(`SELECT * FROM reports WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined
  if (!row) return null
  return {
    id: row.id as string,
    input: row.input as string,
    status: row.status as ReportStatus,
    payload: row.payload ? (JSON.parse(row.payload as string) as Report) : null,
    error: (row.error as string | null) ?? null,
    usage: row.usage ? (JSON.parse(row.usage as string) as UsageSummary) : null,
    createdAt: row.created_at as number,
    completedAt: (row.completed_at as number | null) ?? null,
  }
}

export function listProgressSince(
  reportId: string,
  sinceId: number,
): ProgressEvent[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM progress_events
       WHERE report_id = ? AND id > ?
       ORDER BY id ASC`,
    )
    .all(reportId, sinceId) as Record<string, unknown>[]
  return rows.map((r) => ({
    id: r.id as number,
    reportId: r.report_id as string,
    phase: r.phase as Phase,
    kind: r.kind as ProgressKind,
    detail: r.detail as string,
    createdAt: r.created_at as number,
  }))
}

export function finishReport(
  id: string,
  payload: Report,
  usage: UsageSummary,
): void {
  getDb()
    .prepare(
      `UPDATE reports
       SET status = 'done', payload = ?, usage = ?, completed_at = ?
       WHERE id = ?`,
    )
    .run(JSON.stringify(payload), JSON.stringify(usage), Date.now(), id)
}

export function failReport(id: string, error: string): void {
  getDb()
    .prepare(
      `UPDATE reports SET status = 'failed', error = ?, completed_at = ?
       WHERE id = ?`,
    )
    .run(error, Date.now(), id)
}

export function recordRateLimitHit(ip: string): void {
  getDb()
    .prepare(`INSERT INTO rate_limits (ip, created_at) VALUES (?, ?)`)
    .run(ip, Date.now())
}

export function countRateLimitHits(ip: string, sinceMs: number): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM rate_limits WHERE ip = ? AND created_at >= ?`,
    )
    .get(ip, sinceMs) as { n: number }
  return row.n
}
