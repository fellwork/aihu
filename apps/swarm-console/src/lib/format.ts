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
  /** Tooltip text — always a real string (never `undefined`), because the
   * `title` DOM property coerces a JS `undefined` to the literal string
   * `"undefined"` on assignment (see `packages/arbor/src/attrs.ts`'s
   * property-vs-attribute split: `title` is `key in el`, so a reactive
   * `title={...}` binding writes `el.title = value` directly, no
   * `removeAttribute` fallback). Empty string means "no tooltip". */
  readonly title: string
}

/** `no-claims` is the one status shared verbatim between the REVIEW and
 * CONTRACTS taxonomies (`packages/swarm/src/main.rs`'s Contract.status enum
 * also allows `"no-claims"`). Display label shortened to `unchecked`
 * (founder: "claims-unchecked takes too much room") — the underlying status
 * VALUE is untouched everywhere else in the bus/data path; only this
 * display string and its tooltip change. */
const NO_CLAIMS_LABEL = 'unchecked'
const NO_CLAIMS_TITLE = 'verdict had no checkable action-claims — not a correctness pass'

/**
 * REVIEW row verification tag (design-lock taxonomy, verbatim):
 * verified -> success, submitted/reconciling -> warning,
 * no-claims -> neutral text 'unchecked' (see NO_CLAIMS_LABEL), DISPUTED ->
 * destructive. An unrecognized status (the bus adds one later) reads as
 * neutral rather than silently borrowing a state color it hasn't earned.
 */
export function reviewTag(status: unknown): StatusTag {
  const s = typeof status === 'string' ? status.toLowerCase() : ''
  if (s === 'verified') return { label: 'verified', tone: 'success', title: '' }
  if (s === 'submitted' || s === 'reconciling') return { label: s, tone: 'warning', title: '' }
  if (s === 'no-claims') return { label: NO_CLAIMS_LABEL, tone: 'neutral', title: NO_CLAIMS_TITLE }
  if (s === 'disputed') return { label: 'disputed', tone: 'destructive', title: '' }
  return { label: s || 'unknown', tone: 'neutral', title: '' }
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
  // `no-claims` FIRST: it contains the substring "claim", which the warning
  // family regex below would otherwise match, painting a not-yet-checked
  // contract as an in-progress (warning) chip instead of neutral.
  if (s === 'no-claims') return { label: NO_CLAIMS_LABEL, tone: 'neutral', title: NO_CLAIMS_TITLE }
  // Destructive family next: "unverified" contains the substring
  // "verified", so a success-first check painted a disputed/unverified
  // contract with a green chip — the operator panel showing the opposite
  // of reality (pre-merge review finding, verified empirically).
  if (/(unverified|blocked|error|disput|fail)/.test(s))
    return { label: s, tone: 'destructive', title: '' }
  if (/(verified|done|merged|success)/.test(s)) return { label: s, tone: 'success', title: '' }
  if (/(claim|submit|reconcil|progress|pending|review|offer)/.test(s))
    return { label: s, tone: 'warning', title: '' }
  return { label: s || 'unknown', tone: 'neutral', title: '' }
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

/* ---------------------------------------------------------------------------
   Tailwind class helpers.

   `@tailwindcss/vite` extracts utility classes by scanning project source
   text for class-name-shaped literals — it does NOT evaluate JS, so a
   class name assembled by string interpolation at runtime (e.g.
   `` `text-${tone}` ``) is invisible to it: only the literal substrings that
   already exist somewhere in a scanned source file get CSS generated.
   Every branch below is therefore written out as a complete literal string
   (never interpolated), so the exact classes Tailwind needs to see live
   here in this plain, tsc-checked `.ts` file where the scanner will find
   them regardless of which branch actually runs at runtime.
   --------------------------------------------------------------------------- */

const TONE_TEXT_CLASS: Record<Tone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
  neutral: 'text-muted',
}

/** The Tailwind text-color utility for a state tone (style-lock hue-band
 * mapping: success/warning/destructive/neutral). Falls back to the neutral
 * (muted) tone for any value not in the closed `Tone` set. */
export function toneTextClass(tone: Tone): string {
  return TONE_TEXT_CLASS[tone] ?? TONE_TEXT_CLASS.neutral
}

/** Chip = state-color text + 1px state-color border on surface (style-lock
 * legal-pairing list — no alpha fills, no new pairings). `border-current`
 * inherits the text color onto the border, so only the tone's text-color
 * utility needs to vary; every other class is static. */
const CHIP_BASE =
  'inline-flex items-center font-mono text-xs tracking-[0.02em] px-2 py-[0.1rem] rounded-sm border border-current bg-surface leading-[1.6] motion-safe:transition-colors motion-safe:duration-150'

export function chipClasses(tone: Tone): string {
  return `${CHIP_BASE} ${toneTextClass(tone)}`
}

/** The lock's taxonomy calls the no-claims review case "neutral TEXT", not a
 * chip (no border/background, just tone-colored mono text). */
const NEUTRAL_TEXT_BASE = 'font-mono text-xs tracking-[0.02em]'

export function neutralTextClasses(tone: Tone): string {
  return `${NEUTRAL_TEXT_BASE} ${toneTextClass(tone)}`
}

/** The live-status dot (identity + liveness ONLY, per the style-lock
 * placement rule) — shared by swarm-header's supervisor dot and
 * agents-roster's per-agent dot. The live variant adds the reduced-motion-
 * gated pulse ring via an `after:` pseudo-element; both branches are
 * complete literal strings (see the module doc above) so Tailwind's scanner
 * finds both regardless of which one is live at runtime. */
const DOT_BASE = 'inline-block flex-none w-[7px] h-[7px] rounded-full relative'
const DOT_LIVE =
  'bg-accent after:content-[""] after:absolute after:inset-0 after:rounded-full after:bg-accent motion-safe:after:animate-[sc-pulse_2.4s_ease-out_infinite]'
const DOT_IDLE = 'bg-muted'

export function dotClasses(live: boolean): string {
  return live ? `${DOT_BASE} ${DOT_LIVE}` : `${DOT_BASE} ${DOT_IDLE}`
}
