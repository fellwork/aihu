#!/usr/bin/env bun
import type { BridgeChannel } from '@aihu/agent-server'
import type { LiveBinding, RequestContext } from '@aihu/agent-service'
/**
 * check:governed — thesis §3: capability, authority, and rate are declared
 * per-member and ENFORCED BY THE SERVER.
 *
 * Failure modes the property exists to prevent, quoted from the thesis:
 * "enforcement displaced to the browser; a declared control that silently
 * no-ops when its plugin is absent; a check that is structurally always-true."
 *
 * This check is BEHAVIORAL, not static — precisely because `AC11` failed by
 * asserting the INVOKER's rejection rather than the GATE's, and reported green
 * while the allowlist was dead code. Every probe stands up a real
 * `AgentService` (G1) or a real `AgentServer` + bridge channel pair (G2) and
 * asserts the gate's own envelope CODE, never merely that the call didn't
 * succeed.
 *
 * G1 — a declared control whose plugin is absent must DENY.
 *   `$scope` declared / authPlugin omitted      → expect 401 AUTH_MISSING.
 *   `$rate-limit` declared / plugin omitted     → expect a fail-closed denial (429).
 *   NOTHING declared / no plugin                → must DISPATCH.
 *
 * G2 — the bridge handshake must be VERIFIED. An unverified channel that
 *   receives `invoke` frames IS the execution authority, so the server must
 *   refuse to delegate to one. Three channels must be REJECTED (no `hello`;
 *   mismatched protocol; non-numeric protocol) and one — a channel that sent a
 *   valid `hello` — must be DELEGATED to.
 *
 * G3 — rate-limit KEY PROVENANCE (#420 / GO1a). The bucket key must derive
 *   from the signature-VERIFIED JWT `sub` (via `AuthPlugin.verify`), never
 *   from caller-supplied `context.userId`. The probe replays the reported
 *   attack: one credential, rotated caller identities → the SAME bucket,
 *   keyed by the verified sub; an unverifiable credential → 401 with the
 *   limiter never consulted. This is the behavioral form of the "key
 *   provenance" check `check:governed` was explicitly documented NOT to
 *   catch before #420 landed. Verified to FAIL against the pre-fix tree
 *   (git stash of packages/ → self-test's should-not-flag G3 case reports
 *   caller-keyed buckets and the run exits 1).
 *
 * ─── Both slices have LANDED (GO1, GO2, 2026-07-19). ────────────────────────
 *
 * This file was updated in the same commit as the fix, because the self-test
 * below was written against the broken tree and would otherwise have gone
 * vacuous the moment the tree went green. Nothing was WEAKENED: the two
 * simulation shims were REMOVED and replaced with stronger, real-behaviour
 * controls in both directions.
 *
 *   Before: the should-not-flag half was a SHIM — a hardcoded
 *     `{ code: 429 }` / early return that simulated the fix the tree did not
 *     yet have. It proved the assertion logic could observe a pass; it could
 *     not prove the SERVER could produce one.
 *
 *   After: the should-not-flag half is the REAL, unmutated tree, and the
 *     should-flag half REGRESSES it using real code paths only — no shim
 *     anywhere:
 *       G1 regression: inject an always-permissive `rateLimitPlugin`, which
 *         reproduces exactly what the old `&& rateLimitPlugin` guard produced —
 *         a declared control that does not enforce.
 *       G2 regression: send a VALID `hello` first. The pre-fix server treated
 *         every channel as delegable; a post-fix server treats a handshaken one
 *         that way. The regression is therefore the real server's real
 *         delegation path, not a stand-in for it.
 *
 * The discrimination proof was likewise re-based rather than dropped. It used
 * to read "$scope denies, $rate-limit does not" — an assertion that only held
 * while the bug did. It now asserts the axis that actually matters and that a
 * broken gate cannot fake: DECLARED-with-absent-plugin denies, UNDECLARED
 * dispatches, and the two declared controls deny with DIFFERENT codes (401 vs
 * 429) so they are provably two separate checks rather than one blanket rule.
 * A gate that denied everything, or allowed everything, fails it.
 *
 * NO suppression comments are supported.
 *
 * Wired into CI (plan-a.yml `check` job). Run manually:
 *   bun run check:governed
 */
import type { AgentBindingSpec } from '@aihu/arbor'
import type { Signal } from '@aihu/signals'
import { JSDOM } from 'jsdom'
import {
  expectCount,
  expectedFrom,
  type Finding,
  refuseVacuous,
  selfTest,
} from './lib/invariant.ts'

// Workspace packages are imported by SOURCE, via the `check:governed` npm
// script's `bun --tsconfig-override ./tsconfig.json`.
//
// That flag is load-bearing, and the reason is not obvious. `@aihu/*` is NOT
// linked into `node_modules` (the install is isolated; `node_modules/@aihu`
// does not exist), so resolution falls to tsconfig `paths`. Bun applies the
// tsconfig NEAREST each file, and the per-package ones — e.g.
// `packages/arbor/tsconfig.json` — omit `baseUrl`, which makes bun ignore
// their `paths` entirely. So the entry's own imports resolve fine while a
// TRANSITIVE one dies: `packages/arbor/src/mount.ts` importing `@aihu/signals`
// fails. `--tsconfig-override` forces the root map on every file and fixes it.
//
// Without the flag this script does not merely mis-measure, it CRASHES before
// reporting — which is how it sat unverified in the WIP commit.
//
// Source, not `dist/`, on purpose: a behavioral invariant that reads a stale
// package build reports on a tree nobody is reviewing. Same trap as the stale
// compiler binary that once produced 24 phantom failures. Bare `bun` without
// the override silently resolves `@aihu/arbor` to a PUBLISHED 2.0.0 tarball in
// `~/.bun/install/cache` — measuring someone else's build, not this tree.
//
// Imports stay dynamic so a resolution failure surfaces here rather than at
// module-graph construction. Type-only imports above are erased entirely.
const { registerAgentMetadata } = await import('@aihu/agent')
const { createAgentService } = await import('@aihu/agent-service')
const { branch, leaf } = await import('@aihu/arbor')
const { createAgentServer } = await import('@aihu/agent-server')
const { signal } = await import('@aihu/signals')

const NAME = 'check:governed'
const SELF_TEST = process.argv.includes('--self-test-only')

const TAG = 'governed-probe'
const ACTION = 'increment'

/** A gate rejection envelope, as `jsonrpcError` produces it. */
interface Envelope {
  error?: string
  code?: number
  result?: unknown
}

// ─── G1: declared control, plugin absent ─────────────────────────────────────

/**
 * A real LiveBinding whose `callAction` has an OBSERVABLE side effect. If the
 * gate lets the call through, `dispatched` flips — so "did the gate deny" is
 * answered by behavior, not by inspecting a return shape alone.
 */
function makeBinding(
  scopeStr: string | null,
  rateLimitStr: string | null,
): LiveBinding & { dispatched(): boolean } {
  let dispatched = false
  return {
    rootId: 1,
    tag: TAG,
    getSignal: () => undefined,
    setSignal: () => {},
    async callAction(name: string): Promise<unknown> {
      if (name !== ACTION) throw new Error(`no action: ${name}`)
      dispatched = true
      return { ok: true }
    },
    scope: () => scopeStr,
    rateLimit: () => rateLimitStr,
    dispose$: () => true,
    dispatched: () => dispatched,
  }
}

interface G1Cell {
  readonly label: string
  /** `$scope` / `$rate-limit` as declared on the binding. */
  readonly scope: string | null
  readonly rateLimit: string | null
  /** Whether the corresponding plugin is supplied. */
  readonly plugin: boolean
  /** Codes that constitute a correct fail-closed denial. */
  readonly expectDenyCodes: readonly number[] | null
}

/**
 * The probe matrix. The undeclared cells are the must-not-flag half: a control
 * that is simply NOT declared must dispatch normally, or the check is just
 * "deny everything".
 */
const G1_MATRIX: readonly G1Cell[] = [
  {
    label: '$scope declared, authPlugin absent',
    scope: 'admin',
    rateLimit: null,
    plugin: false,
    expectDenyCodes: [401],
  },
  {
    label: '$rate-limit declared, rateLimitPlugin absent',
    scope: null,
    rateLimit: '10/min',
    plugin: false,
    expectDenyCodes: [429, 401, 403],
  },
  {
    label: 'no control declared, no plugin (must dispatch)',
    scope: null,
    rateLimit: null,
    plugin: false,
    expectDenyCodes: null,
  },
  {
    label: '$rate-limit declared, plugin present and permissive (must dispatch)',
    scope: null,
    rateLimit: '10/min',
    plugin: true,
    expectDenyCodes: null,
  },
]

interface ProbeOutcome {
  readonly label: string
  readonly denied: boolean
  readonly code: number | undefined
  readonly dispatched: boolean
  readonly correct: boolean
  readonly detail: string
}

/**
 * @param regressed When true, reproduce the PRE-GO1 defect using real code
 *   only: hand every `$rate-limit` cell an always-permissive plugin, so the
 *   declared control runs but never denies — observationally identical to the
 *   old `if (rateLimitSpec !== null && rateLimitPlugin)` guard skipping it.
 *   The should-flag cells must flip to "not denied" under this, which is what
 *   proves the probe can still see the violation it was written for.
 */
async function runG1Cell(cell: G1Cell, regressed: boolean): Promise<ProbeOutcome> {
  const binding = makeBinding(cell.scope, cell.rateLimit)
  const registry = new Map<string, LiveBinding[]>([[TAG, [binding]]])
  const regressRateLimit = regressed && cell.rateLimit !== null && !cell.plugin

  // #420: the gate requires a signature-VERIFIED principal before it will even
  // consult a rate limit. Rate-limit-only cells get a verify-capable
  // authPlugin so the outcome they measure is specifically the RATE-LIMIT
  // control (429 when its plugin is absent), not the earlier 401 principal
  // refusal — which also keeps the discrimination proof's distinct-codes axis
  // honest. Scope cells keep their declared authPlugin absence.
  const verifyingAuth = {
    checkScope: () => true,
    verify: async (jwt: string) => (jwt === 'probe-jwt' ? { sub: 'probe-user' } : null),
  }

  // The action IS advertised in metadata, so the 404 "unknown action" branch
  // cannot fire. This is the explicit anti-AC11 guard: we assert the GATE's
  // 401/429, never merely `ok === false`, and never the invoker's own
  // rejection of an unknown name.
  const service = createAgentService({
    manifests: [{ tag: TAG, describes: 'probe', actions: { [ACTION]: { returns: {} } } }],
    getRegistry: () => registry,
    ...(cell.plugin && cell.scope ? { authPlugin: { checkScope: () => true } } : {}),
    ...(cell.scope === null && cell.rateLimit !== null ? { authPlugin: verifyingAuth } : {}),
    ...((cell.plugin && cell.rateLimit) || regressRateLimit
      ? { rateLimitPlugin: { checkRateLimit: () => true } }
      : {}),
  })

  const ctx: RequestContext = { userId: 'probe-user', jwt: 'probe-jwt' }
  const env = (await service.handleToolCall(`${TAG}/${ACTION}`, [], ctx)) as Envelope

  const code = typeof env.code === 'number' ? env.code : undefined
  const denied = code !== undefined
  const dispatched = binding.dispatched()

  if (cell.expectDenyCodes === null) {
    const correct = !denied
    return {
      label: cell.label,
      denied,
      code,
      dispatched,
      correct,
      detail: correct
        ? 'dispatched normally, as an undeclared/permitted control must'
        : `expected normal dispatch, got a denial (code ${code}) — the gate is denying an ` +
          'undeclared control, which would make the check "deny everything"',
    }
  }

  const correct = denied && cell.expectDenyCodes.includes(code!)
  return {
    label: cell.label,
    denied,
    code,
    dispatched,
    correct,
    detail: correct
      ? `gate denied with code ${code}, as required`
      : denied
        ? `gate denied but with code ${code}; expected one of ${cell.expectDenyCodes.join('/')}`
        : 'GATE DID NOT DENY — the declared control silently no-opped because its plugin is ' +
          `absent, and the action ${binding.dispatched() ? 'DISPATCHED' : 'returned'} instead. ` +
          'A control that evaporates with its plugin is not enforcement.',
  }
}

async function runG1(regressed: boolean): Promise<ProbeOutcome[]> {
  const out: ProbeOutcome[] = []
  for (const cell of G1_MATRIX) out.push(await runG1Cell(cell, regressed))
  return out
}

// ─── G2: bridge handshake verification ───────────────────────────────────────

/** Upper bound on any single bridge wait. Generous; only hit on a real hang. */
const BRIDGE_DEADLINE_MS = 2000

function sleep(ms: number): Promise<undefined> {
  return new Promise((r) => setTimeout(() => r(undefined), ms))
}

/** Poll `probe` until it yields a value or the deadline passes. */
async function waitFor<T>(probe: () => T | undefined, deadlineMs: number): Promise<T | undefined> {
  const until = Date.now() + deadlineMs
  for (;;) {
    const v = probe()
    if (v !== undefined) return v
    if (Date.now() >= until) return undefined
    await sleep(5)
  }
}

function domHost(): Element {
  return new JSDOM('<!DOCTYPE html><body></body>').window.document.body
}

/** A real in-memory bridge channel; outbound frames are captured. */
function makeChannel(sent: string[]): BridgeChannel & { reply(data: string): void } {
  let onMsg: ((d: string) => void) | null = null
  return {
    get connected() {
      return true
    },
    send: (d: string) => {
      sent.push(d)
    },
    onMessage(h) {
      onMsg = h
      return () => {
        onMsg = null
      }
    },
    onClose() {
      return () => {}
    },
    reply(d: string) {
      onMsg?.(d)
    },
  }
}

function makeComponent(): { node: ReturnType<typeof branch>; agentBinding: AgentBindingSpec } {
  const [count, setCount] = signal(0)
  const sig = [count, setCount] as unknown as Signal<string>
  return {
    node: branch('div', { id: TAG }, [leaf(sig)]),
    agentBinding: {
      tag: TAG,
      actions: { [ACTION]: () => setCount(count() + 1) },
      reads: { count: () => count() },
      writes: { count: (v: unknown) => setCount(Number(v)) },
    },
  }
}

interface G2Sub {
  readonly label: string
  /** The `hello` frame to send before invoking, or null to send none. */
  readonly hello: string | null
  /**
   * `true` when the channel is legitimate and the server MUST delegate to it.
   * This is the anti-vacuity half: without it, "refuse every channel" would
   * score a perfect G2, and the fix would be indistinguishable from breaking
   * the bridge outright.
   */
  readonly mustDelegate?: boolean
}

const G2_SUBPROBES: readonly G2Sub[] = [
  { label: 'invoke with NO hello sent at all', hello: null },
  {
    label: 'hello with protocol = BRIDGE_PROTOCOL_VERSION + 1',
    hello: JSON.stringify({ type: 'hello', protocol: 2 }),
  },
  {
    label: "hello with protocol = 'not-a-number'",
    hello: JSON.stringify({ type: 'hello', protocol: 'not-a-number' }),
  },
  {
    label: 'hello with a VALID protocol (must delegate)',
    hello: JSON.stringify({ type: 'hello', protocol: 1 }),
    mustDelegate: true,
  },
]

/**
 * Drive a real `createAgentServer` with a channel that never completes a valid
 * handshake, then call an approved tool.
 *
 * The observable: does the server DELEGATE to the unverified channel? A frame
 * on the wire proves the channel became the execution authority without ever
 * having proved which protocol it speaks. A correct implementation refuses to
 * treat an unhandshaken channel as the authoritative instance.
 */
async function runG2Sub(sub: G2Sub, regressed: boolean): Promise<ProbeOutcome> {
  registerAgentMetadata({
    tag: TAG,
    describes: 'probe',
    actions: { [ACTION]: { returns: {} } },
    state: {},
  })
  const comp = makeComponent()
  const server = createAgentServer({
    target: { node: comp.node, agentBinding: comp.agentBinding },
    createHost: domHost,
  })
  try {
    const sent: string[] = []
    const channel = makeChannel(sent)
    server.attachBridge(channel)

    // `--self-test` REGRESSION (no shim): prepend a valid handshake. The
    // pre-GO2 server delegated to every channel unconditionally; a post-GO2
    // server delegates to a handshaken one. So sending a good `hello` first
    // reproduces the old delegation behaviour through the REAL code path, and
    // the three must-reject sub-probes must flip to "delegated" — which is what
    // proves this probe is not structurally always-green now that the tree is
    // fixed. The must-delegate sub-probe is unaffected (it already handshakes).
    if (regressed) channel.reply(JSON.stringify({ type: 'hello', protocol: 1 }))
    if (sub.hello) channel.reply(sub.hello)

    const call = server.callTool(`${TAG}/${ACTION}`, [], { userId: 'probe-user', jwt: 'j' })
    // `callTool` awaits the gate before forwarding, so the wire is still empty
    // on this tick. Poll for the frame, then answer it — the bridge path waits
    // on a browser reply that would otherwise never come. A hard deadline
    // bounds every wait: an invariant that HANGS in CI is worse than one that
    // fails, because it looks like infrastructure flake rather than a defect.
    const frame = await waitFor(() => sent.find((s) => s.includes('"invoke"')), BRIDGE_DEADLINE_MS)
    if (frame) {
      const parsed = JSON.parse(frame) as { callId: string }
      channel.reply(JSON.stringify({ type: 'result', callId: parsed.callId, result: null }))
    }
    await Promise.race([call, sleep(BRIDGE_DEADLINE_MS)])

    const delegated = frame !== undefined
    const correct = sub.mustDelegate === true ? delegated : !delegated
    return {
      label: sub.label,
      denied: !delegated,
      code: undefined,
      dispatched: delegated,
      correct,
      detail: sub.mustDelegate
        ? delegated
          ? 'server delegated to the properly handshaken channel, as it must'
          : 'server REFUSED a channel that sent a valid `hello` — the handshake check has ' +
            'become "reject everything", which breaks the bridge instead of governing it.'
        : delegated
          ? 'server FORWARDED an `invoke` to a channel that never completed a valid handshake — ' +
            'the unverified channel became the execution authority. BRIDGE_PROTOCOL_VERSION is ' +
            'sent and exported but never compared against anything.'
          : 'server refused to delegate to the unverified channel',
    }
  } finally {
    server.dispose()
  }
}

async function runG2(regressed: boolean): Promise<ProbeOutcome[]> {
  const out: ProbeOutcome[] = []
  for (const sub of G2_SUBPROBES) out.push(await runG2Sub(sub, regressed))
  return out
}

// ─── G3: rate-limit key provenance (#420) ────────────────────────────────────
//
// The reported attack: rate-limit keys were `${context.userId}:${tag}` with
// `userId` caller-supplied and never cross-checked against the JWT `sub`, so
// rotating `userId` reset the caller's own quota. The fix derives the key
// from the signature-verified principal (`AuthPlugin.verify(jwt).sub`).
//
// BEHAVIORAL, like G1/G2 (the issue allowed a static probe; a behavioral one
// is strictly stronger — it measures what the gate DOES, not what its source
// mentions). The probe replays the attack against a real `AgentService` and
// observes the keys the rate-limit plugin is actually consulted with:
//   1. one credential, two rotated caller userIds → BOTH calls must land in
//      the SAME bucket, keyed by the verified sub — and neither rotated
//      identity may appear in any key; and
//   2. an unverifiable credential → 401, with the limiter NEVER consulted
//      (no fall-through to caller claims).
//
// `--self-test` REGRESSION (real code path, no shim): the regressed plugin's
// `verify` ECHOES the caller-supplied identity as `sub`. The gate then keys
// buckets off whatever the caller claimed — observationally identical to the
// pre-#420 `${userId}:${tag}` derivation — and the probe must flag it.

const G3_SUB = 'g3-verified-principal'
const G3_JWT = 'g3-signed-token'

async function runG3(regressed: boolean): Promise<ProbeOutcome[]> {
  const binding = makeBinding(null, '100/min')
  const registry = new Map<string, LiveBinding[]>([[TAG, [binding]]])
  const usedKeys: string[] = []
  let callerIdentity = ''

  const service = createAgentService({
    manifests: [{ tag: TAG, describes: 'probe', actions: { [ACTION]: { returns: {} } } }],
    getRegistry: () => registry,
    authPlugin: {
      checkScope: () => true,
      verify: async (jwt: string) => {
        if (regressed) return { sub: callerIdentity } // caller controls the principal
        return jwt === G3_JWT ? { sub: G3_SUB } : null
      },
    },
    rateLimitPlugin: {
      checkRateLimit: (_spec: string, key: string) => {
        usedKeys.push(key)
        return true
      },
    },
  })

  // The attack: same credential, rotated caller identity.
  for (const caller of ['rotated-a', 'rotated-b']) {
    callerIdentity = caller
    await service.handleToolCall(`${TAG}/${ACTION}`, [], { userId: caller, jwt: G3_JWT })
  }
  const rotationKeys = [...usedKeys]

  // An unverifiable credential must be refused before the limiter is touched.
  callerIdentity = 'rotated-c'
  const forgedEnv = (await service.handleToolCall(`${TAG}/${ACTION}`, [], {
    userId: 'rotated-c',
    jwt: 'not-a-signed-token',
  })) as Envelope
  const forgedDenied401 = forgedEnv.code === 401
  const limiterUntouchedByForged = usedKeys.length === rotationKeys.length

  const expectedKey = `${G3_SUB}:${TAG}`
  const sameVerifiedBucket =
    rotationKeys.length === 2 && rotationKeys.every((k) => k === expectedKey)
  const callerLeaked = rotationKeys.some((k) => k.includes('rotated-'))

  const correct = sameVerifiedBucket && !callerLeaked && forgedDenied401 && limiterUntouchedByForged
  return [
    {
      label: 'rate-limit key derives from the VERIFIED principal, not caller context',
      denied: forgedDenied401,
      code: forgedEnv.code,
      dispatched: binding.dispatched(),
      correct,
      detail: correct
        ? `both rotated-identity calls keyed ${expectedKey}; unverifiable credential got 401 ` +
          'with the limiter untouched'
        : callerLeaked || !sameVerifiedBucket
          ? `CALLER CONTROLS THE BUCKET KEY — observed keys [${rotationKeys.join(', ')}], ` +
            `expected [${expectedKey}, ${expectedKey}]. A caller that rotates its ` +
            'context.userId mints itself a fresh quota; the key must come from the ' +
            'signature-verified JWT `sub`, never from caller-supplied context.'
          : `unverifiable credential was not refused cleanly (code ${forgedEnv.code}, limiter ` +
            `consulted ${usedKeys.length - rotationKeys.length} extra time(s)) — verification ` +
            'must complete, and fail closed, before any quota is consumed',
    },
  ]
}

// ─── Self-test ───────────────────────────────────────────────────────────────

async function runSelfTest(): Promise<void> {
  // Should-NOT-flag half: the real, unmutated tree. GO1 and GO2 have landed, so
  // this must be clean — and it is the REAL server producing that, not a shim.
  const g1Live = await runG1(false)
  const g2Live = await runG2(false)
  const g3Live = await runG3(false)
  // Should-flag half: the same real code paths, regressed to their pre-fix
  // behaviour (permissive rate-limit plugin / pre-sent valid handshake /
  // caller-echoing principal). The probes must still see the violations they
  // were written for.
  const g1Regressed = await runG1(true)
  const g2Regressed = await runG2(true)
  const g3Regressed = await runG3(true)

  selfTest(NAME, [
    {
      label: 'should-not-flag: fail-closed rate limiting (live tree, GO1 landed)',
      actual: g1Live.filter((o) => !o.correct).length,
      expected: 0,
    },
    {
      label: 'should-not-flag: verified handshake (live tree, GO2 landed)',
      actual: g2Live.filter((o) => !o.correct).length,
      expected: 0,
    },
    {
      label: 'should-not-flag: verified-principal rate-limit keys (live tree, #420 landed)',
      actual: g3Live.filter((o) => !o.correct).length,
      expected: 0,
    },
    {
      label: 'should-flag: rate-limit control that does not enforce (regressed)',
      actual: g1Regressed.filter((o) => !o.correct).length,
      expected: 1,
    },
    {
      label: 'should-flag: bridge sub-probes delegated unverified (regressed)',
      actual: g2Regressed.filter((o) => !o.correct).length,
      expected: 3,
    },
    {
      label: 'should-flag: caller-controlled rate-limit key (regressed)',
      actual: g3Regressed.filter((o) => !o.correct).length,
      expected: 1,
    },
  ])

  // ── Discrimination proof ───────────────────────────────────────────────────
  //
  // This used to read "$scope denies, $rate-limit does not", which was only
  // ever true while GO1's bug was. Post-fix BOTH deny, so that phrasing would
  // now be either failing or vacuous. It is re-based onto the axis the property
  // is actually about, which a broken gate cannot fake in either direction:
  //
  //   (a) both DECLARED controls deny when their plugin is absent — under-
  //       enforcement is caught; and
  //   (b) they deny with DIFFERENT codes (401 vs 429), proving two separate
  //       checks rather than one blanket "declared ⇒ deny" rule; and
  //   (c) the UNDECLARED cell still dispatches — over-enforcement is caught.
  //
  // A gate that denied everything fails (c). One that allowed everything fails
  // (a). One that collapsed the two controls into a single rule fails (b).
  const scopeCell = g1Live.find((o) => o.label.startsWith('$scope'))!
  const rateCell = g1Live.find((o) => o.label.startsWith('$rate-limit declared, rateLimitPlugin'))!
  const undeclaredCell = g1Live.find((o) => o.label.startsWith('no control declared'))!

  const problems: string[] = []
  if (!scopeCell.denied) problems.push('$scope with no authPlugin did NOT deny')
  if (!rateCell.denied) problems.push('$rate-limit with no rateLimitPlugin did NOT deny')
  if (scopeCell.code === rateCell.code) {
    problems.push(
      `both declared controls denied with the SAME code (${scopeCell.code}) — they must be ` +
        'distinguishable (401 for absent auth, 429 for absent rate limiting), or the gate is ' +
        'applying one blanket rule rather than enforcing each declaration',
    )
  }
  if (undeclaredCell.denied) {
    problems.push(
      `an UNDECLARED control was denied (code ${undeclaredCell.code}) — the gate has become ` +
        '"deny everything", which is not enforcement either',
    )
  }
  if (problems.length > 0) {
    console.error(
      `${NAME} — HARNESS/GATE BROKEN: no count from this run is trustworthy.\n  - ` +
        problems.join('\n  - '),
    )
    process.exit(1)
  }
  console.log(
    `${NAME} — discrimination ok: declared controls deny with distinct codes ` +
      `($scope ${scopeCell.code}, $rate-limit ${rateCell.code}); an undeclared control still ` +
      'dispatches.',
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

await runSelfTest()
if (SELF_TEST) process.exit(0)

const g1 = await runG1(false)
const g2 = await runG2(false)
const g3 = await runG3(false)
refuseVacuous([...g1, ...g2, ...g3], NAME, 'governance probes')

const findings: Finding[] = []

// G1 — one finding per declared control that failed to deny.
for (const o of g1.filter((x) => !x.correct)) {
  findings.push({
    where: 'packages/agent-service/src/agent-service.ts:215',
    rule: 'G1',
    message: `${o.label} — ${o.detail}`,
  })
}

// G3 — one finding: one defect (key provenance), one finding.
for (const o of g3.filter((x) => !x.correct)) {
  findings.push({
    where: 'packages/agent-service/src/agent-service.ts',
    rule: 'G3',
    message: `${o.label} — ${o.detail}`,
  })
}

// G2 — ONE finding if ANY sub-probe fails to reject. One defect (the absent
// comparison), one finding; per-sub-probe findings would inflate the count.
const g2Bad = g2.filter((x) => !x.correct)
if (g2Bad.length > 0) {
  findings.push({
    where: 'packages/agent-server/src/agent-server.ts:158',
    rule: 'G2',
    message:
      `bridge handshake is never verified — ${g2Bad.length}/${g2.length} sub-probes were ` +
      `accepted that should have been rejected (${g2Bad.map((b) => b.label).join('; ')}). ` +
      "`handleBridgeFrame`'s `case 'hello'` returns without inspecting `msg.protocol`.",
  })
}

console.log(
  `${NAME} — ran ${g1.length} G1 cells, ${g2.length} G2 sub-probes, and ${g3.length} G3 ` +
    'key-provenance probe(s).',
)
expectCount(findings, expectedFrom(process.argv, 'governed'), NAME)
