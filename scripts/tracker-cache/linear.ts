/**
 * scripts/tracker-cache/linear.ts — minimal read-only Linear GraphQL client.
 *
 * Deliberately independent of .claude/skills/swarm/swarm.ts: this cache is a
 * plain data mirror, not a coordination/role system, and shouldn't carry that
 * dependency. Token is read from the macOS keychain at call time and never
 * logged, printed, or written to disk.
 */
import { execFileSync } from 'node:child_process'

let cachedToken: string | null | undefined

function readLinearToken(): string | null {
  if (cachedToken !== undefined) return cachedToken
  try {
    cachedToken = execFileSync(
      'security',
      ['find-generic-password', '-s', 'LINEAR_API_KEY', '-w'],
      { encoding: 'utf8' },
    ).trim()
  } catch {
    cachedToken = null
  }
  return cachedToken
}

export function hasLinearToken(): boolean {
  return readLinearToken() !== null
}

export interface LinearIssue {
  identifier: string
  title: string
  createdAt: string
  updatedAt: string
  url: string
  state: { name: string }
  project: { name: string } | null
  assignee: { name: string } | null
  labels: { nodes: { name: string }[] }
}

/**
 * Fetch every non-completed/canceled issue in the `aihu` Linear project,
 * oldest first. This repo is `aihu`; FEL also tracks `data`/`web` projects
 * for other repos, which this cache deliberately excludes.
 */
export async function fetchLinearIssues(): Promise<LinearIssue[]> {
  const token = readLinearToken()
  if (!token) throw new Error('[tracker-cache] LINEAR_API_KEY not found in keychain')

  const query = `{
    issues(first: 250, orderBy: createdAt, filter: { project: { name: { eq: "aihu" } }, state: { type: { nin: ["completed", "canceled"] } } }) {
      nodes { identifier title createdAt updatedAt url state { name } project { name } assignee { name } labels(first: 10) { nodes { name } } }
    }
  }`

  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) {
    throw new Error(`[tracker-cache] Linear API HTTP ${res.status}: ${await res.text()}`)
  }
  const json = (await res.json()) as {
    data?: { issues: { nodes: LinearIssue[] } }
    errors?: unknown[]
  }
  if (json.errors?.length) {
    throw new Error(`[tracker-cache] Linear GraphQL errors: ${JSON.stringify(json.errors)}`)
  }
  if (!json.data) throw new Error('[tracker-cache] Linear API returned no data')
  return json.data.issues.nodes
}
