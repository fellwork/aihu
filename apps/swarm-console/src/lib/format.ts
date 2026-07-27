/**
 * Plain-TS display helpers for the swarm console. Kept out of the `.aihu`
 * SFC's `@state` block (and therefore inside `tsconfig.json`'s `include`)
 * so they're real, `tsc --noEmit`-checked code — the repo's established
 * split (see `apps/docs-next/src/lib/*`, also excluded-from-tsc `.aihu`).
 *
 * `SwarmRecord` entries (from `@aihu/use/useSwarm`) are open
 * `Record<string, unknown>` — the bus does not publish a fixed per-array
 * shape — so every reader here is defensive: an unexpected/missing field
 * degrades to a safe fallback rather than throwing mid-render.
 */

/** The four semantic state tones this app uses, per the style lock's closed
 * hue-band list (terracotta/ochre/sage/graphite). No new hue. */
export type Tone = 'success' | 'warning' | 'destructive' | 'neutral'

export interface StatusTag {
  readonly label: string
  readonly tone: Tone
}

/**
 * REVIEW row verification tag (design-lock taxonomy, verbatim):
 * verified -> success, submitted/reconciling -> warning,
 * no-claims -> neutral text 'claims-unchecked', DISPUTED -> destructive.
 * An unrecognized status (the bus adds one later) reads as neutral rather
 * than silently borrowing a state color it hasn't earned.
 */
export function reviewTag(status: unknown): StatusTag {
  const s = typeof status === 'string' ? status.toLowerCase() : ''
  if (s === 'verified') return { label: 'verified', tone: 'success' }
  if (s === 'submitted' || s === 'reconciling') return { label: s, tone: 'warning' }
  if (s === 'no-claims') return { label: 'claims-unchecked', tone: 'neutral' }
  if (s === 'disputed') return { label: 'disputed', tone: 'destructive' }
  return { label: s || 'unknown', tone: 'neutral' }
}

/**
 * CONTRACTS ledger status -> tone. The lock only specifies the REVIEW tag
 * taxonomy explicitly; contract statuses ("claimed", "offered", "verified",
 * …) are mapped onto the same four tones by keyword family so a contract
 * row and a review row read consistently rather than inventing a fifth
 * vocabulary.
 */
export function contractTag(status: unknown): StatusTag {
  const s = typeof status === 'string' ? status.toLowerCase() : ''
  if (/(verified|done|merged|success)/.test(s)) return { label: s, tone: 'success' }
  if (/(blocked|error|disput|fail)/.test(s)) return { label: s, tone: 'destructive' }
  if (/(claim|submit|reconcil|progress|pending|review|offer)/.test(s))
    return { label: s, tone: 'warning' }
  return { label: s || 'unknown', tone: 'neutral' }
}

/** Extract the PR number out of a bus-supplied `pr` field. The bus sends an
 * already-formatted label ("PR #640"), not a bare number, so this pulls the
 * digits back out to build the github.com link href. */
export function prNumber(pr: unknown): number | null {
  if (typeof pr !== 'string') return null
  const m = pr.match(/(\d+)/)
  return m ? Number(m[1]) : null
}

export function prHref(pr: unknown): string | null {
  const n = prNumber(pr)
  return n === null ? null : `https://github.com/fellwork/aihu/pull/${n}`
}

/** First line of a free-text error/message field. Errors are open records
 * (no fixed shape), so this tries the field names most likely to carry the
 * message and falls back to a generic label rather than dumping raw JSON. */
export function firstLine(record: Record<string, unknown>): string {
  const raw = record.message ?? record.msg ?? record.error ?? record.text ?? record.reason ?? ''
  const s = typeof raw === 'string' ? raw : JSON.stringify(raw)
  const line = s.split('\n')[0]
  return line && line.length > 0 ? line : '(no message)'
}

/** Truncate a free-text note (e.g. a contract's `recon`) to a single-line
 * preview for the ledger's fixed-width column. */
export function truncate(value: unknown, max = 72): string {
  const s = typeof value === 'string' ? value : ''
  const line = s.split('\n')[0] ?? ''
  if (line.length <= max) return line
  return `${line.slice(0, max - 1).trimEnd()}…`
}

/** Defensive string read off an open `SwarmRecord`. */
export function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

/** Defensive boolean read off an open `SwarmRecord` — anything but a literal
 * `true` reads as not-live, never throws on `undefined`/other shapes. */
export function bool(value: unknown): boolean {
  return value === true
}

/** Defensive array read off an open `SwarmRecord`. */
export function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}
