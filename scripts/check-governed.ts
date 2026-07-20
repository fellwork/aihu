#!/usr/bin/env bun
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
 *   `$scope` declared / authPlugin omitted     → expect 401 AUTH_MISSING. Passes today.
 *   `$rate-limit` declared / plugin omitted    → expect a fail-closed denial. FAILS today:
 *      `agent-service.ts:215` reads `if (rateLimitSpec !== null && rateLimitPlugin)`, so the
 *      plugin's absence makes the whole branch unreachable and the call dispatches.
 *
 *   That G1 reports scope PASS and rate-limit FAIL from the SAME harness is the
 *   check's own proof of discrimination. If both pass or both fail, the harness
 *   is broken and this script says so rather than reporting a count.
 *
 * G2 — the bridge handshake must be VERIFIED. `BRIDGE_PROTOCOL_VERSION` is sent
 *   (`bridge-client.ts:67`), exported (`agent-server.ts:302`), and never appears
 *   on the right-hand side of a comparison anywhere in the tree. An unverified
 *   channel becomes the execution authority: `handleBridgeFrame`'s `case 'hello'`
 *   returns without inspecting `msg.protocol`. FAILS today — one finding.
 *
 * NO suppression comments are supported.
 *
 * Wired into CI (plan-a.yml `check` job). Run manually:
 *   bun run check:governed
 */
import type { AgentBindingSpec } from '@aihu/arbor'
import type { BridgeChannel } from '@aihu/agent-server'
import type { LiveBinding, RequestContext } from '@aihu/agent-service'
import type { Signal } from '@aihu/signals'
import { JSDOM } from 'jsdom'
import { type Finding, expectCount, expectedFrom, refuseVacuous, selfTest } from './lib/invariant.ts'

// Workspace packages are imported DYNAMICALLY, and by source: the
// `--preload ./scripts/lib/resolve-workspace-src.ts` resolver plugin maps
// `@aihu/*` to `packages/<pkg>/src`, and bun applies runtime onResolve hooks
// only to imports evaluated after preload — the entry module's static imports
// are resolved before it runs. Type-only imports above are erased, so they
// never hit the resolver.
//
// Source, not `dist/`, on purpose: a behavioral invariant that reads a stale
// package build reports on a tree nobody is reviewing. Same trap as the stale
// compiler binary that once produced 24 phantom failures.
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

async function runG1Cell(cell: G1Cell, failClosed: boolean): Promise<ProbeOutcome> {
  const binding = makeBinding(cell.scope, cell.rateLimit)
  const registry = new Map<string, LiveBinding[]>([[TAG, [binding]]])

  // The action IS advertised in metadata, so the 404 "unknown action" branch
  // cannot fire. This is the explicit anti-AC11 guard: we assert the GATE's
  // 401/429, never merely `ok === false`, and never the invoker's own
  // rejection of an unknown name.
  const service = createAgentService({
    manifests: [{ tag: TAG, describes: 'probe', actions: { [ACTION]: { returns: {} } } }],
    getRegistry: () => registry,
    ...(cell.plugin && cell.scope ? { authPlugin: { checkScope: () => true } } : {}),
    ...(cell.plugin && cell.rateLimit
      ? { rateLimitPlugin: { checkRateLimit: () => true } }
      : {}),
  })

  const ctx: RequestContext = { userId: 'probe-user', jwt: 'probe-jwt' }
  const raw = (await service.handleToolCall(`${TAG}/${ACTION}`, [], ctx)) as Envelope

  // `--self-test` mutation: simulate the fail-closed implementation the
  // property requires, so the should-flag cells must flip to denied. This is
  // what proves the probe can observe a PASS, not only the current failure.
  let env = raw
  if (failClosed && cell.rateLimit !== null && !cell.plugin) {
    env = { error: 'RATE_LIMIT_PLUGIN_ABSENT: fail closed', code: 429 }
  }

  const code = typeof env.code === 'number' ? env.code : undefined
  const denied = code !== undefined
  const dispatched = binding.dispatched() && !failClosed

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

async function runG1(failClosed: boolean): Promise<ProbeOutcome[]> {
  const out: ProbeOutcome[] = []
  for (const cell of G1_MATRIX) out.push(await runG1Cell(cell, failClosed))
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
async function runG2Sub(sub: G2Sub, verifyHandshake: boolean): Promise<ProbeOutcome> {
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
    if (sub.hello) channel.reply(sub.hello)

    // `--self-test` mutation: a verifying server refuses to delegate to a
    // channel that has not completed a valid handshake. Under this shim all
    // three sub-probes must flip to rejected, which proves the probe can
    // observe the fixed state and is not simply always-red.
    if (verifyHandshake) {
      const ok = sub.hello !== null && (JSON.parse(sub.hello) as { protocol?: unknown }).protocol === 1
      if (!ok) {
        return {
          label: sub.label,
          denied: true,
          code: 503,
          dispatched: false,
          correct: true,
          detail: 'unverified channel refused; invocation not delegated',
        }
      }
    }

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
    return {
      label: sub.label,
      denied: !delegated,
      code: undefined,
      dispatched: delegated,
      correct: !delegated,
      detail: delegated
        ? 'server FORWARDED an `invoke` to a channel that never completed a valid handshake — ' +
          'the unverified channel became the execution authority. BRIDGE_PROTOCOL_VERSION is ' +
          'sent and exported but never compared against anything.'
        : 'server refused to delegate to the unverified channel',
    }
  } finally {
    server.dispose()
  }
}

async function runG2(verifyHandshake: boolean): Promise<ProbeOutcome[]> {
  const out: ProbeOutcome[] = []
  for (const sub of G2_SUBPROBES) out.push(await runG2Sub(sub, verifyHandshake))
  return out
}

// ─── Self-test ───────────────────────────────────────────────────────────────

async function runSelfTest(): Promise<void> {
  // Should-flag half: the real, unmutated tree. The two rate-limit/handshake
  // controls must be observed failing.
  const g1Live = await runG1(false)
  const g2Live = await runG2(false)
  // Should-not-flag half: the mutated (fixed) tree. Everything must pass, which
  // proves the probes are not structurally always-red.
  const g1Fixed = await runG1(true)
  const g2Fixed = await runG2(true)

  selfTest(NAME, [
    {
      label: 'should-flag: rate-limit control with plugin absent (live tree)',
      actual: g1Live.filter((o) => !o.correct).length,
      expected: 1,
    },
    {
      label: 'should-flag: bridge sub-probes not rejected (live tree)',
      actual: g2Live.filter((o) => !o.correct).length,
      expected: 3,
    },
    {
      label: 'should-not-flag: fail-closed rate limiting (mutated tree)',
      actual: g1Fixed.filter((o) => !o.correct).length,
      expected: 0,
    },
    {
      label: 'should-not-flag: verified handshake (mutated tree)',
      actual: g2Fixed.filter((o) => !o.correct).length,
      expected: 0,
    },
  ])

  // The discrimination proof the spec calls for: scope and rate-limit come out
  // of the SAME harness with OPPOSITE verdicts. If both agree, the harness is
  // broken and no count from it is trustworthy.
  const scopeCell = g1Live.find((o) => o.label.startsWith('$scope'))!
  const rateCell = g1Live.find((o) => o.label.startsWith('$rate-limit declared, rateLimitPlugin'))!
  if (scopeCell.correct === rateCell.correct) {
    console.error(
      `${NAME} — HARNESS BROKEN: the $scope and $rate-limit cells agree ` +
        `(both ${scopeCell.correct ? 'PASS' : 'FAIL'}). They must disagree — scope denies ` +
        'without its plugin, rate-limit does not. Identical verdicts mean the probe is not ' +
        'measuring the control it names.',
    )
    process.exit(1)
  }
  console.log(
    `${NAME} — discrimination ok: $scope denies (${scopeCell.code}), $rate-limit does not.`,
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

await runSelfTest()
if (SELF_TEST) process.exit(0)

const g1 = await runG1(false)
const g2 = await runG2(false)
refuseVacuous([...g1, ...g2], NAME, 'governance probes')

const findings: Finding[] = []

// G1 — one finding per declared control that failed to deny.
for (const o of g1.filter((x) => !x.correct)) {
  findings.push({
    where: 'packages/agent-service/src/agent-service.ts:215',
    rule: 'G1',
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

console.log(`${NAME} — ran ${g1.length} G1 cells and ${g2.length} G2 sub-probes.`)
expectCount(findings, expectedFrom(process.argv, 'governed'), NAME)
