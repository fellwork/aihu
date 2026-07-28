/**
 * `useSwarm` — reactive view of the swarm command-center's local bus HTTP
 * API (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * The bus (default `http://127.0.0.1:8791`) exposes:
 *   - `GET /state`  -> a snapshot of {@link SwarmState}.
 *   - `GET /stream` -> Server-Sent Events, one `data: <SwarmState json>\n\n`
 *     frame roughly every second.
 * This composable opens the `/stream` connection and keeps a signal in sync
 * with the latest frame — it never polls `/state` itself.
 *
 * Return convention (ratified): an object of named getters (+ `close`),
 * signals under the hood. Readers in .aihu templates MUST call getters with
 * parens: `{agents()}`, never bare `{agents}`.
 *
 * SSR (`isClient === false`): returns a static empty {@link SwarmState}
 * default, `connected` is a static `false`, `close` is a no-op — and,
 * critically, NO `EventSource` is ever constructed. This is the `isClient`
 * no-op invariant: an SSR render must never open a network connection.
 * The same no-op path is also taken when `EventSource` itself is undefined
 * (an environment with a DOM but no SSE support) or when an explicit
 * `options.window` is `undefined`.
 */

import { signal } from '@aihu/signals'
import { defaultWindow, isClient, tryOnScopeDispose } from '../shared/index.ts'

// The typed `/state` view-models and the boundary validator live in
// ./schema.ts (C-SWARM-SCHEMA). `/state` is the one swarm shape that crosses
// into TypeScript, so validating it here IS the work — the bus PAYLOADS
// (Verdict/Blocked/Claim) are already enforced in Rust by swarm-bus and no TS
// code sends them, so a Zod payload mirror is deferred, not dropped.
import {
  type AgentEntry,
  type ContractEntry,
  type DecideEntry,
  type ErrorEntry,
  type OrphanEntry,
  parseSwarmState,
  type ReviewEntry,
  type SwarmParseError,
  type SwarmState,
} from './schema.ts'

export type {
  AgentEntry,
  ContractEntry,
  DecideEntry,
  ErrorEntry,
  OrphanEntry,
  ReviewEntry,
  SwarmParseError,
  SwarmState,
} from './schema.ts'

/** @deprecated The `/state` arrays are now typed per {@link SwarmState}; this
 * loose alias remains only for callers written against the pre-schema shape. */
export type SwarmRecord = Record<string, unknown>

/** `decide`/`orphan`/`reviews`/`errors` grouped under one getter — the
 * "what needs a human/agent decision right now" slice of {@link SwarmState}. */
export interface SwarmYourMove {
  decide: DecideEntry[]
  orphan: OrphanEntry[]
  reviews: ReviewEntry[]
  errors: ErrorEntry[]
}

export interface UseSwarmOptions {
  /** Base URL of the bus (no trailing slash). Default
   * `http://127.0.0.1:8791`; `/stream` is appended to open the SSE
   * connection. */
  url?: string
  /** The `window` used to gate client-ness. Default the global `window`.
   * Passing `undefined` explicitly forces the SSR-style no-op path, same as
   * `useLocalStorage`. */
  window?: Window
}

export interface UseSwarmReturn {
  /** Reactive getter — read as `{state()}` in templates (parens required).
   * The latest full {@link SwarmState} frame; a static empty default under
   * SSR / before the first frame arrives. */
  readonly state: () => SwarmState
  /** Reactive getter — `state().agents`. */
  readonly agents: () => AgentEntry[]
  /** Reactive getter — `state().contracts`. */
  readonly contracts: () => ContractEntry[]
  /** Reactive getter — the `decide`/`orphan`/`reviews`/`errors` slice of
   * `state()`, grouped for a "what needs a move" view. */
  readonly yourMove: () => SwarmYourMove
  /** Reactive getter — whether the `/stream` connection is currently open.
   * Always `false` under SSR. */
  readonly connected: () => boolean
  /** Reactive getter — the LOUD drift signal. `null` when the latest `/state`
   * frame validated; a {@link SwarmParseError} naming the failed field(s) when
   * it did not. The UI MUST render this: `/state` is produced by out-of-tree
   * `dashboard.py`, so a renamed Python field is caught only here, and a
   * silent empty panel ("nothing to decide") would be indistinguishable from
   * drift ("schema broke"). A validation failure NEVER blanks the data —
   * `state()` keeps the last good frame and `error()` explains the drift. */
  readonly error: () => SwarmParseError | null
  /** Tear down the underlying `EventSource`. Idempotent; a no-op under
   * SSR. */
  close: () => void
}

const DEFAULT_URL = 'http://127.0.0.1:8791'

function emptyState(): SwarmState {
  return {
    t: '',
    supervisor_up: false,
    decide: [],
    orphan: [],
    reviews: [],
    errors: [],
    agents: [],
    contracts: [],
    activity: [],
  }
}

function yourMoveOf(s: SwarmState): SwarmYourMove {
  return { decide: s.decide, orphan: s.orphan, reviews: s.reviews, errors: s.errors }
}

/**
 * Open a live connection to the swarm command-center bus's `/stream`
 * endpoint and expose its state reactively. See the module doc for the SSR
 * no-op path.
 */
export function useSwarm(options: UseSwarmOptions = {}): UseSwarmReturn {
  const { url = DEFAULT_URL } = options
  // `in`-check, not a destructuring default: the documented contract is that
  // an EXPLICIT `{ window: undefined }` forces the SSR no-op path, but a
  // destructuring default fires for explicit undefined exactly as for an
  // omitted key, silently substituting the real window (review finding).
  const win = 'window' in options ? options.window : defaultWindow

  // SSR (or no window, or no EventSource support): static default, no
  // signal, no network connection — the isClient no-op invariant.
  if (!isClient || win === undefined || typeof EventSource === 'undefined') {
    const state = (): SwarmState => emptyState()
    const agents = (): AgentEntry[] => []
    const contracts = (): ContractEntry[] => []
    const yourMove = (): SwarmYourMove => ({ decide: [], orphan: [], reviews: [], errors: [] })
    const connected = (): boolean => false
    const error = (): SwarmParseError | null => null
    const close = (): void => {}
    return { state, agents, contracts, yourMove, connected, error, close }
  }

  const [state, setState] = signal(emptyState())
  const [connected, setConnected] = signal(false)
  // The LOUD drift surface: null while frames validate, a field-naming error
  // when one does not. A failure never blanks `state()` — see onmessage.
  const [error, setError] = signal<SwarmParseError | null>(null)

  const source = new EventSource(`${url}/stream`)
  let stopped = false
  let lastRaw = ''

  source.onopen = () => {
    if (stopped) return
    setConnected(true)
  }

  source.onmessage = (event) => {
    if (stopped) return
    setConnected(true)
    // Skip byte-identical frames: a fresh parse of the same payload would
    // still replace the state signal (Object.is sees a new object) and force
    // every derived row array downstream to recompute. HONEST LIMIT: the
    // current bus stamps `t` into every frame, so identical frames are rare
    // today — this guards reconnect replays and a future content-keyed
    // server. The full fix (per-section signals with content equality) is a
    // deliberate follow-up, not smuggled into this diff.
    if (event.data === lastRaw) return
    lastRaw = event.data
    // Two failure modes, both made LOUD, never silent. (1) Malformed JSON —
    // do not throw out of an EventSource callback, but do NOT swallow it
    // either: surface it. (2) Well-formed JSON that fails the /state schema —
    // the cross-language drift this contract exists to catch. In BOTH cases we
    // keep the last good frame (never blank the board) AND set `error` naming
    // what broke; a good frame later clears it.
    let raw: unknown
    try {
      raw = JSON.parse(event.data)
    } catch {
      setError(() => ({ message: 'swarm /state frame was not valid JSON', fields: ['<json>'] }))
      return
    }
    const result = parseSwarmState(raw)
    if (result.ok) {
      setState(() => result.value)
      setError(() => null)
    } else {
      // Drift: dashboard.py (out-of-tree) changed a field. Keep the last good
      // state; make the failure visible instead of degrading to empty.
      setError(() => result.error)
    }
  }

  source.onerror = () => {
    if (stopped) return
    setConnected(false)
  }

  const close = (): void => {
    if (stopped) return
    stopped = true
    source.close()
    setConnected(false)
  }

  // Scope-owned auto-cleanup; no-ops (returns false) for scopeless callers,
  // whose contract is the returned close().
  tryOnScopeDispose(close)

  const agents = (): AgentEntry[] => state().agents
  const contracts = (): ContractEntry[] => state().contracts
  const yourMove = (): SwarmYourMove => yourMoveOf(state())

  return { state, agents, contracts, yourMove, connected, error, close }
}
