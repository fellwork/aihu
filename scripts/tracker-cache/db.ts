/**
 * scripts/tracker-cache/db.ts — shared SQLite handle for the tracker cache.
 *
 * The DB file lives at `.cache/tracker.db` (gitignored — this is a local
 * mirror, not source of truth). Opening it also runs schema.sql, so a fresh
 * checkout gets a working (empty) cache on first `sync.ts`/`query.ts` call
 * rather than an ENOENT.
 */
import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '../..')
export const CACHE_DIR = join(REPO_ROOT, '.cache')
export const DB_PATH = join(CACHE_DIR, 'tracker.db')

export function openDb(): Database {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })
  const db = new Database(DB_PATH, { create: true })
  db.exec('PRAGMA journal_mode = WAL;')
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8')
  db.exec(schema)
  return db
}

export function nowIso(): string {
  return new Date().toISOString()
}
