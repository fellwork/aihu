/**
 * Boundary schema + validator for the swarm command-center `/state` payload
 * (C-SWARM-SCHEMA). `useSwarm` receives `/state` view-models over SSE; this
 * module is the ONLY place that shape is enforced in TypeScript.
 *
 * WHY A HAND-ROLLED VALIDATOR, NOT ZOD. `@aihu/use` is a ratified
 * dependency-minimal composable library (its sole runtime dep is
 * `@aihu/signals`). `zod` is absent from the whole monorepo; adding it here
 * for a console-only `/state` shape would be the repo's first zod dependency,
 * paid by every `useSwarm` consumer. The ruling named "Zod" for the SUBSTANCE
 * — validate at the boundary, and on drift produce a LOUD error that NAMES the
 * field — and that substance is achieved below with zero new dependency. Swap
 * to zod-the-package if the tradeoff is judged the other way; the surface
 * ({@link parseSwarmState} → ok | field paths) does not change.
 *
 * THE HAZARD THIS EXISTS TO CATCH. `/state` is produced by `~/.swarm/
 * dashboard.py` (Python, OUT OF ANY REPO — this validator cannot gate it).
 * That is a cross-language contract nothing enforces end to end: Python may
 * rename a field tomorrow. When it does, this validator must make the drift
 * LOUD and VISIBLE — an error naming the field — never degrade to an empty
 * array. An empty DECIDE bucket that means the schema drifted is
 * indistinguishable from one that means there is genuinely nothing to decide —
 * the worst failure for this particular UI. See `useSwarm`'s `error` getter.
 *
 * GRANULARITY (the #664 lesson at the right level). Fixed-shape arrays are
 * CLOSED — their known fields are required, so a renamed/removed field is a
 * loud error. They are NOT strict: dashboard.py adding a field is
 * backward-compatible and must not false-trip drift. `agents[]` is kept OPEN
 * (only the two fields the UI hard-reads are required) because its shape
 * genuinely varies — over-closing it would recreate the closed-enum failure
 * one level down.
 *
 * `reviews[].pr` is typed honestly as a string (`"PR #641"` | null), NOT
 * coerced to a number — that is dashboard.py's formatting decision; changing
 * it is a separate contract against the Python, not a schema fix.
 */

// ─── the typed /state view-models (derived from the live serializer) ─────────

export interface DecideEntry {
  from: string
  contract: string | null
  ago: string
  question: string
}
export interface OrphanEntry {
  contract: string
}
export interface ReviewEntry {
  contract: string
  owner: string | null
  status: string
  /** dashboard.py surface: the string `"PR #641"` or null — not a number. */
  pr: string | null
}
export interface ErrorEntry {
  from: string
  ago: string
  msg: string
}
export interface ContractEntry {
  id: string
  issue: string | null
  owner: string | null
  status: string
  recon: string
}
export interface ActivityEntry {
  ago: string
  from: string
  to: string
  kind: string
  contract: string
}
/** OPEN: only `role` and `flags` are required (the UI reads `a.flags.length`
 * unconditionally); every other field is dashboard-defined and may vary. */
export interface AgentEntry {
  role: string
  flags: string[]
  [k: string]: unknown
}
export interface SwarmBacklog {
  count?: number
  sample?: unknown[]
}
export interface SwarmState {
  /** Formatted clock string from the server (`"20:31:10"`), not an epoch. */
  t: string
  supervisor_up: boolean
  decide: DecideEntry[]
  orphan: OrphanEntry[]
  reviews: ReviewEntry[]
  errors: ErrorEntry[]
  backlog?: SwarmBacklog
  agents: AgentEntry[]
  contracts: ContractEntry[]
  activity: ActivityEntry[]
}

/** The loud, field-naming result of a failed `/state` validation. */
export interface SwarmParseError {
  /** One human line for the console banner. */
  message: string
  /** Every field path that failed, e.g. `decide[0].question` — this is what
   * makes the drift diagnosable rather than a blank panel. */
  fields: string[]
}

// ─── the validator (no dependency) ───────────────────────────────────────────

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Field-level checks push a named path into `errs` and return whether the
 * value was accepted. `null`-tolerant variants exist because several
 * dashboard fields are legitimately nullable (owner, pr, contract). */
function str(v: unknown, p: string, e: string[]): boolean {
  if (typeof v === 'string') return true
  e.push(`${p}: expected string`)
  return false
}
function strOrNull(v: unknown, p: string, e: string[]): boolean {
  if (typeof v === 'string' || v === null) return true
  e.push(`${p}: expected string | null`)
  return false
}

/** Validate one CLOSED object: every listed field must be present and pass;
 * unknown extra keys are IGNORED (additive dashboard changes are safe). */
function closed(
  v: unknown,
  p: string,
  e: string[],
  fields: Record<string, (x: unknown, fp: string, fe: string[]) => boolean>,
): boolean {
  if (!isRec(v)) {
    e.push(`${p}: expected object`)
    return false
  }
  let ok = true
  // Object.entries (not `for..in` + `fields[key]`) so `check` is typed as the
  // validator, not `Fn | undefined` under noUncheckedIndexedAccess.
  for (const [key, check] of Object.entries(fields)) {
    if (!(key in v)) {
      e.push(`${p}.${key}: missing`)
      ok = false
      continue
    }
    if (!check((v as Rec)[key], `${p}.${key}`, e)) ok = false
  }
  return ok
}

/** Validate a homogeneous array with a per-item validator. */
function arr(
  v: unknown,
  p: string,
  e: string[],
  item: (x: unknown, ip: string, ie: string[]) => boolean,
): boolean {
  if (!Array.isArray(v)) {
    e.push(`${p}: expected array`)
    return false
  }
  let ok = true
  v.forEach((x, i) => {
    if (!item(x, `${p}[${i}]`, e)) ok = false
  })
  return ok
}

const decideItem = (v: unknown, p: string, e: string[]) =>
  closed(v, p, e, { from: str, contract: strOrNull, ago: str, question: str })
const orphanItem = (v: unknown, p: string, e: string[]) => closed(v, p, e, { contract: str })
const reviewItem = (v: unknown, p: string, e: string[]) =>
  closed(v, p, e, { contract: str, owner: strOrNull, status: str, pr: strOrNull })
const errorItem = (v: unknown, p: string, e: string[]) =>
  closed(v, p, e, { from: str, ago: str, msg: str })
const contractItem = (v: unknown, p: string, e: string[]) =>
  closed(v, p, e, { id: str, issue: strOrNull, owner: strOrNull, status: str, recon: str })
const activityItem = (v: unknown, p: string, e: string[]) =>
  closed(v, p, e, { ago: str, from: str, to: str, kind: str, contract: str })

/** OPEN: require only the two fields the UI hard-reads; ignore the rest. */
function agentItem(v: unknown, p: string, e: string[]): boolean {
  if (!isRec(v)) {
    e.push(`${p}: expected object`)
    return false
  }
  let ok = str(v.role, `${p}.role`, e)
  if (!('flags' in v) || !Array.isArray(v.flags)) {
    e.push(`${p}.flags: expected array`)
    ok = false
  }
  return ok
}

function backlog(v: unknown, p: string, e: string[]): boolean {
  if (v === undefined) return true // older bus builds omit it
  if (!isRec(v)) {
    e.push(`${p}: expected object`)
    return false
  }
  let ok = true
  if ('count' in v && typeof v.count !== 'number') {
    e.push(`${p}.count: expected number`)
    ok = false
  }
  if ('sample' in v && !Array.isArray(v.sample)) {
    e.push(`${p}.sample: expected array`)
    ok = false
  }
  return ok
}

/**
 * Validate a raw parsed `/state` object. Returns the typed value on success,
 * or the full list of failed field paths — never a partial or a silent
 * default. The caller ({@link useSwarm}) surfaces `fields` loudly and keeps
 * the last good frame rather than blanking the UI.
 */
export function parseSwarmState(
  raw: unknown,
): { ok: true; value: SwarmState } | { ok: false; error: SwarmParseError } {
  const e: string[] = []
  if (!isRec(raw)) {
    return { ok: false, error: { message: 'swarm /state is not an object', fields: ['<root>'] } }
  }
  str(raw.t, 't', e)
  if (typeof raw.supervisor_up !== 'boolean') e.push('supervisor_up: expected boolean')
  arr(raw.decide, 'decide', e, decideItem)
  arr(raw.orphan, 'orphan', e, orphanItem)
  arr(raw.reviews, 'reviews', e, reviewItem)
  arr(raw.errors, 'errors', e, errorItem)
  backlog(raw.backlog, 'backlog', e)
  arr(raw.agents, 'agents', e, agentItem)
  arr(raw.contracts, 'contracts', e, contractItem)
  arr(raw.activity, 'activity', e, activityItem)

  if (e.length > 0) {
    return {
      ok: false,
      error: {
        message: `swarm /state failed schema validation (${e.length} issue${e.length === 1 ? '' : 's'}) — the bus (dashboard.py) may have drifted`,
        fields: e,
      },
    }
  }
  return { ok: true, value: raw as unknown as SwarmState }
}
