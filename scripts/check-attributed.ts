#!/usr/bin/env bun
/**
 * check:attributed — thesis §4 tier 0: the service can verify WHOSE agent asks.
 *
 * "Tier 0 is co-equal with the other three properties. A transport that cannot
 * express 'who is asking' has failed the thesis even if it never transacts —
 * because the gate downstream has nothing to decide against, and the failure is
 * invisible until someone audits it."
 *
 * Every transport must reach the action invoker with a `RequestContext`. Today
 * `agent-server` does; `agent-a2a` and `agent-acp` do not.
 *
 * Grep is insufficient: `handleToolCall` appears ~22 times across
 * `packages/<pkg>/src`, and the large majority are comments, JSDoc, type
 * declarations, or interface signatures. Only three are CALLS from a transport.
 * So this walks the AST and considers only `CallExpression` nodes.
 *
 * THE a2a AND acp CALL SITES EACH CARRY A COMMENT claiming
 *   "v1: … ANONYMOUS-ONLY … so scoped/$rate-limited tools fail closed (401)
 *    through this path."
 * THIS CHECK IGNORES IT ENTIRELY. It is a claim, not a fact, and the thesis
 * rejects it explicitly: the failure stands "regardless of whether they
 * transact." A check that honored an in-source waiver comment would be exactly
 * the vacuous pattern this slice exists to eliminate. NO suppression comments
 * are supported by any check in this slice.
 *
 * Anti-vacuity: the discovered transport count must be exactly 3, and at least
 * one must PASS. A rule that flags all three is indistinguishable from a rule
 * that flags everything. A transport added without being registered here breaks
 * the build on purpose.
 *
 * Wired into CI (plan-a.yml `check` job). Run manually:
 *   bun run check:attributed
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Glob } from 'bun'
import ts from 'typescript'
import {
  expectCount,
  expectedFrom,
  type Finding,
  isExcluded,
  ROOT,
  refuseVacuous,
  selfTest,
} from './lib/invariant.ts'

const NAME = 'check:attributed'

/**
 * The transport packages. `agent-service` is deliberately ABSENT: it is the
 * CALLEE, not a transport. Its own internal re-entry at
 * `agent-service.ts:295` (`this.handleToolCall(…, ctx)` inside `asMiddleware`)
 * is not a transport boundary and must never be counted.
 */
const TRANSPORT_PACKAGES = ['agent-server', 'agent-a2a', 'agent-acp'] as const
const EXPECTED_TRANSPORT_COUNT = 3

/** The invoker whose call sites carry the attribution obligation. */
const INVOKER = 'handleToolCall'
/** The context parameter's position in `handleToolCall(name, params, ctx)`. */
const CTX_ARG_INDEX = 2

interface CallSite {
  readonly file: string
  readonly line: number
  readonly arity: number
  /** Verdict for this individual call site. */
  readonly carriesContext: boolean
  readonly detail: string
}

function parse(source: string, fileName: string): ts.SourceFile {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
}

/**
 * Classify a third argument.
 *
 * - absent (arity < 3)                        → no context
 * - literal `null` / `undefined` / `void 0`   → no context
 * - identifier / property access / call / etc → context forwarded
 *
 * A literal null is treated exactly like an omission on purpose: `acp` passes
 * `null` for params and nothing for ctx, and a rule that accepted "a third
 * argument exists" would be satisfied by a hardcoded null.
 */
function classifyCtxArg(arg: ts.Expression | undefined): { ok: boolean; detail: string } {
  if (!arg)
    return { ok: false, detail: 'no third argument — the call is anonymous by construction' }
  if (arg.kind === ts.SyntaxKind.NullKeyword) {
    return { ok: false, detail: 'third argument is a literal `null` — no identity is carried' }
  }
  if (ts.isIdentifier(arg) && arg.text === 'undefined') {
    return { ok: false, detail: 'third argument is a literal `undefined` — no identity is carried' }
  }
  if (ts.isVoidExpression(arg)) {
    return { ok: false, detail: 'third argument is `void 0` — no identity is carried' }
  }
  return { ok: true, detail: `third argument \`${arg.getText().slice(0, 60)}\` forwards a context` }
}

/** Collect every `…handleToolCall(…)` CALL in a source file. */
function collectCallSites(rel: string, source: string): CallSite[] {
  const sf = parse(source, rel)
  const out: CallSite[] = []

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      const isInvoker =
        (ts.isPropertyAccessExpression(callee) && callee.name.text === INVOKER) ||
        (ts.isIdentifier(callee) && callee.text === INVOKER)
      if (isInvoker) {
        const { ok, detail } = classifyCtxArg(node.arguments[CTX_ARG_INDEX])
        out.push({
          file: rel,
          line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
          arity: node.arguments.length,
          carriesContext: ok,
          detail,
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

// ─── Scan ────────────────────────────────────────────────────────────────────

interface TransportResult {
  readonly pkg: string
  readonly sites: CallSite[]
  readonly passes: boolean
}

function scanTransport(pkg: string, base = ROOT): TransportResult {
  const sites: CallSite[] = []
  for (const m of new Glob(`packages/${pkg}/src/**/*.ts`).scanSync(base)) {
    const rel = m.replaceAll('\\', '/')
    if (isExcluded(rel)) continue
    const abs = join(base, rel)
    if (!existsSync(abs)) continue
    sites.push(...collectCallSites(rel, readFileSync(abs, 'utf8')))
  }
  sites.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
  // A transport passes iff it has at least one call site and EVERY call site
  // forwards a context. One anonymous path is enough to fail the property.
  return { pkg, sites, passes: sites.length > 0 && sites.every((s) => s.carriesContext) }
}

function toFindings(results: readonly TransportResult[]): Finding[] {
  const findings: Finding[] = []
  for (const r of results) {
    if (r.passes) continue
    if (r.sites.length === 0) {
      findings.push({
        where: `packages/${r.pkg}/src`,
        rule: 'AT',
        message:
          `transport \`${r.pkg}\` contains no \`${INVOKER}\` call site — it cannot reach the ` +
          'action invoker at all, so tier-0 attribution is unverifiable here.',
      })
      continue
    }
    const bad = r.sites.filter((s) => !s.carriesContext)
    // One transport, one finding — the property is per-transport, and a
    // transport with two anonymous calls is one failing transport.
    findings.push({
      where: `${bad[0]!.file}:${bad[0]!.line}`,
      rule: 'AT',
      message:
        `transport \`${r.pkg}\` reaches \`${INVOKER}\` without a RequestContext ` +
        `(arity ${bad[0]!.arity}): ${bad[0]!.detail}. Tier 0 requires every transport to express ` +
        'who is asking, even when the answer is anonymous — the gate downstream has nothing to ' +
        'decide against otherwise.' +
        (bad.length > 1 ? ` (${bad.length} anonymous call sites in this transport.)` : ''),
    })
  }
  return findings
}

// ─── Bidirectional self-test ─────────────────────────────────────────────────

/**
 * In-memory fixtures rather than files on disk: the discrimination being proved
 * is purely lexical/structural, and inlining keeps the should-flag and
 * should-not-flag cases adjacent to the rule they exercise.
 */
const SELF_TEST_SOURCES: ReadonlyArray<{ label: string; source: string; expected: number }> = [
  {
    label: 'should-flag: two-arg call (the a2a shape)',
    expected: 1,
    source: `
      declare const service: { handleToolCall(a: string, b: unknown, c?: unknown): Promise<unknown> }
      // v1: this adapter is ANONYMOUS-ONLY — so scoped tools fail closed (401).
      // The check MUST ignore this waiver comment entirely.
      export async function send(msg: string) {
        return await service.handleToolCall(msg ?? '', null)
      }
    `,
  },
  {
    label: 'should-flag: three args but a literal null context',
    expected: 1,
    source: `
      declare const service: { handleToolCall(a: string, b: unknown, c?: unknown): Promise<unknown> }
      export async function send(msg: string) {
        return await service.handleToolCall(msg, null, null)
      }
    `,
  },
  {
    label: 'should-not-flag: context forwarded (the agent-server shape)',
    expected: 0,
    source: `
      declare const service: { handleToolCall(a: string, b: unknown, c?: unknown): Promise<unknown> }
      export async function send(toolName: string, params: unknown, ctx?: unknown) {
        return await service.handleToolCall(toolName, params, ctx)
      }
    `,
  },
  {
    label: 'should-not-flag: interface signature and JSDoc, not a call',
    expected: 0,
    source: `
      /** Calls handleToolCall(name, params) under the hood. */
      export interface AgentService {
        handleToolCall(toolName: string, params: unknown, ctx?: unknown): Promise<unknown>
      }
      // service.handleToolCall(name, params) — commented out, not a call.
      export type Handler = typeof AgentService.prototype.handleToolCall
      declare const service: { handleToolCall(a: string, b: unknown, c?: unknown): Promise<unknown> }
      export async function ok(n: string, p: unknown, ctx?: unknown) {
        return service.handleToolCall(n, p, ctx)
      }
    `,
  },
]

function runSelfTest(): void {
  const cases = SELF_TEST_SOURCES.map((c) => {
    const sites = collectCallSites(`<self-test>/${c.label}.ts`, c.source)
    const anonymous = sites.filter((s) => !s.carriesContext).length
    return { label: c.label, actual: anonymous, expected: c.expected }
  })
  selfTest(NAME, cases)
}

// ─── Main ────────────────────────────────────────────────────────────────────

runSelfTest()

const results = TRANSPORT_PACKAGES.map((p) => scanTransport(p))
refuseVacuous(results, NAME, 'transport packages')

// Anti-drift: a new transport must be registered here, or the build breaks.
const discovered = [...new Glob('packages/agent-*/src').scanSync({ cwd: ROOT, onlyFiles: false })]
  .map((p) => p.replaceAll('\\', '/').split('/')[1]!)
  .filter((p) => p !== 'agent' && p !== 'agent-service')
const unregistered = discovered.filter(
  (p) => !(TRANSPORT_PACKAGES as readonly string[]).includes(p),
)
if (unregistered.length > 0) {
  console.error(
    `${NAME} — unregistered transport package(s): ${unregistered.join(', ')}. ` +
      'Add them to TRANSPORT_PACKAGES and update the baseline. A transport that is not ' +
      'checked is a transport that can go anonymous silently.',
  )
  process.exit(1)
}
if (results.length !== EXPECTED_TRANSPORT_COUNT) {
  console.error(
    `${NAME} — discovered ${results.length} transports, expected ${EXPECTED_TRANSPORT_COUNT}.`,
  )
  process.exit(1)
}

const passing = results.filter((r) => r.passes)
if (passing.length === 0) {
  console.error(
    `${NAME} — ZERO transports pass. A rule that flags every transport is indistinguishable ` +
      'from a rule that flags everything; at least one PASS is required as the anti-vacuity ' +
      'guard. Verify the check before trusting this number.',
  )
  process.exit(1)
}

console.log(
  `${NAME} — ${results.length} transports, ${results.reduce((n, r) => n + r.sites.length, 0)} ` +
    `\`${INVOKER}\` call site(s). Passing: ${passing.map((r) => r.pkg).join(', ')}.`,
)
expectCount(toFindings(results), expectedFrom(process.argv, 'attributed'), NAME)
