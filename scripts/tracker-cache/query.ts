#!/usr/bin/env bun
/**
 * scripts/tracker-cache/query.ts — read-only CLI over the tracker cache.
 *
 * Prefer this to `gh`/Linear for routine lookups — it's a local SQLite read,
 * zero network, zero tokens. Falls back to telling you to run sync.ts if the
 * cache doesn't exist yet; always prints each source's last-synced time so a
 * stale cache is never mistaken for a live one.
 *
 * Usage:
 *   bun scripts/tracker-cache/query.ts status
 *   bun scripts/tracker-cache/query.ts issues [--state open|closed|all] [--label X]
 *   bun scripts/tracker-cache/query.ts prs [--state open|closed|merged|all] [--failing]
 *   bun scripts/tracker-cache/query.ts linear [--state X] [--project aihu]
 *   bun scripts/tracker-cache/query.ts show-issue <number>
 *   bun scripts/tracker-cache/query.ts show-pr <number>
 */
import { existsSync } from 'node:fs'
import { DB_PATH, openDb } from './db.ts'

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag)
  return i === -1 ? null : (process.argv[i + 1] ?? null)
}
function hasFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

function ageOf(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

function printSyncStatus(db: ReturnType<typeof openDb>): void {
  const rows = db.query('SELECT * FROM sync_log ORDER BY source').all() as {
    source: string
    last_synced_at: string
    item_count: number
    ok: number
    error: string | null
  }[]
  if (rows.length === 0) {
    console.log('No sync recorded yet — run: bun scripts/tracker-cache/sync.ts')
    return
  }
  for (const r of rows) {
    const flag = r.ok ? '✓' : '✗ STALE/FAILED'
    console.log(`${flag} ${r.source}: ${r.item_count} items, synced ${ageOf(r.last_synced_at)}`)
    if (!r.ok && r.error) console.log(`    error: ${r.error}`)
  }
}

function cmdStatus(db: ReturnType<typeof openDb>): void {
  printSyncStatus(db)
}

function cmdIssues(db: ReturnType<typeof openDb>): void {
  const state = (arg('--state') ?? 'open').toUpperCase()
  const label = arg('--label')
  let sql = 'SELECT number, title, state, state_reason, labels_json, updated_at FROM github_issues'
  const clauses: string[] = []
  const params: Record<string, unknown> = {}
  if (state !== 'ALL') {
    clauses.push('state = $state')
    params.$state = state
  }
  if (label) {
    clauses.push('labels_json LIKE $label')
    params.$label = `%"${label}"%`
  }
  if (clauses.length) sql += ` WHERE ${clauses.join(' AND ')}`
  sql += ' ORDER BY number DESC'
  const rows = db.query(sql).all(params) as {
    number: number
    title: string
    state: string
    state_reason: string | null
    labels_json: string
    updated_at: string
  }[]
  for (const r of rows) {
    const labels = JSON.parse(r.labels_json) as string[]
    console.log(
      `#${r.number}\t${r.state}${r.state_reason ? `(${r.state_reason})` : ''}\t${r.title}${labels.length ? `  [${labels.join(', ')}]` : ''}`,
    )
  }
  console.log(`\n${rows.length} issue(s). Source: `, '')
  printSyncStatus(db)
}

function cmdPrs(db: ReturnType<typeof openDb>): void {
  const state = (arg('--state') ?? 'open').toUpperCase()
  const failingOnly = hasFlag('--failing')
  let sql = 'SELECT number, title, state, is_draft, checks_json, updated_at FROM github_prs'
  const clauses: string[] = []
  const params: Record<string, unknown> = {}
  if (state !== 'ALL') {
    clauses.push('state = $state')
    params.$state = state
  }
  if (clauses.length) sql += ` WHERE ${clauses.join(' AND ')}`
  sql += ' ORDER BY number DESC'
  const rows = db.query(sql).all(params) as {
    number: number
    title: string
    state: string
    is_draft: number
    checks_json: string
    updated_at: string
  }[]
  for (const r of rows) {
    const checks = JSON.parse(r.checks_json) as { name: string; conclusion: string | null }[]
    const failing = checks.filter(
      (c) => c.conclusion && !['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(c.conclusion),
    )
    if (failingOnly && failing.length === 0) continue
    const draft = r.is_draft ? ' [draft]' : ''
    const failStr = failing.length ? `  FAILING: ${failing.map((c) => c.name).join(', ')}` : ''
    console.log(`#${r.number}\t${r.state}${draft}\t${r.title}${failStr}`)
  }
}

function cmdLinear(db: ReturnType<typeof openDb>): void {
  const state = arg('--state')
  const project = arg('--project')
  let sql = 'SELECT identifier, title, state, project, assignee, created_at FROM linear_issues'
  const clauses: string[] = []
  const params: Record<string, unknown> = {}
  if (state) {
    clauses.push('state = $state')
    params.$state = state
  }
  if (project) {
    clauses.push('project = $project')
    params.$project = project
  }
  if (clauses.length) sql += ` WHERE ${clauses.join(' AND ')}`
  sql += ' ORDER BY created_at ASC'
  const rows = db.query(sql).all(params) as {
    identifier: string
    title: string
    state: string
    project: string | null
    assignee: string | null
    created_at: string | null
  }[]
  for (const r of rows) {
    console.log(
      `${r.identifier}\t${r.state}\t${r.project ?? '-'}\t${r.assignee ?? 'unassigned'}\t${r.title}`,
    )
  }
  console.log(`\n${rows.length} task(s).`)
}

function cmdShowIssue(db: ReturnType<typeof openDb>, n: string): void {
  const row = db.query('SELECT * FROM github_issues WHERE number = $n').get({ $n: Number(n) })
  console.log(
    row ? JSON.stringify(row, null, 2) : `#${n} not in cache — run sync.ts, or it may not exist`,
  )
}

function cmdShowPr(db: ReturnType<typeof openDb>, n: string): void {
  const row = db.query('SELECT * FROM github_prs WHERE number = $n').get({ $n: Number(n) })
  console.log(
    row ? JSON.stringify(row, null, 2) : `#${n} not in cache — run sync.ts, or it may not exist`,
  )
}

function main(): void {
  if (!existsSync(DB_PATH)) {
    console.log(`No cache at ${DB_PATH} yet — run: bun scripts/tracker-cache/sync.ts`)
    process.exit(1)
  }
  const db = openDb()
  const cmd = process.argv[2]
  switch (cmd) {
    case 'status':
      cmdStatus(db)
      break
    case 'issues':
      cmdIssues(db)
      break
    case 'prs':
      cmdPrs(db)
      break
    case 'linear':
      cmdLinear(db)
      break
    case 'show-issue': {
      const n = process.argv[3]
      if (!n) throw new Error('usage: query.ts show-issue <number>')
      cmdShowIssue(db, n)
      break
    }
    case 'show-pr': {
      const n = process.argv[3]
      if (!n) throw new Error('usage: query.ts show-pr <number>')
      cmdShowPr(db, n)
      break
    }
    default:
      console.log(
        'usage: query.ts <status|issues|prs|linear|show-issue <n>|show-pr <n>> [--state ...] [--label ...] [--project ...] [--failing]',
      )
      process.exit(cmd ? 1 : 0)
  }
  db.close()
}

main()
