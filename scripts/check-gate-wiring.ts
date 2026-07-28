#!/usr/bin/env bun
/**
 * check-gate-wiring.ts — C-FEL-428 gate-wiring meta-check.
 *
 * Two properties per gate: (1) REACHABILITY — some CI path invokes it; (2)
 * NEGATIVE FIXTURE — its red path was EXECUTED this run and observed to exit
 * non-zero. Both halves below.
 *
 * WHY THIS EXISTS: a gate that no CI path ever invokes is green-by-construction
 * — it can never make a PR red, so it protects nothing. That is the
 * FEL-438/FEL-430 shape ("an invariant parked outside CI protects nothing",
 * check:emit-parses' own plan-a.yml comment). This meta-check enumerates every
 * gate and asserts each is REACHABLE by CI.
 *
 * REACHABILITY = EITHER ROUTE (orchestrator amendment, post-#673): a gate is
 * reachable if it is in the `check:ci` transitive chain OR an actual `run:`
 * step in any .github/workflows/*.yml invokes it. The repo DELIBERATELY runs
 * cheap always-on gates as their own workflow job (lesson-refs, readme-sync)
 * rather than inside check:ci; a check:ci-ONLY test would flag those
 * correctly-wired gates and pressure someone to undo #673.
 *
 * ...BUT THE CHAIN ROUTE IS CONDITIONAL, and this is the correction that this
 * meta-check most needed (C-FEL-GATE-WIRING-RUNS). Membership in `check:ci`
 * only means "CI invokes this gate" IF SOME WORKFLOW INVOKES `check:ci`. On
 * main it did not — plan-a.yml says so in its own words ("`check:ci` is invoked
 * by no workflow in this repo") — so the chain route was asserting a fact that
 * was false, and it was covering for exactly ONE gate: check:gate-wiring
 * ITSELF, which appeared in no `run:` step anywhere in .github/. The meta-check
 * that exists to forbid green-by-construction gates was one. So the chain route
 * is now GATED on `ciChainIsWired` below, derived from the same `run:` bodies as
 * everything else. Self-correcting in both directions: wire `check:ci` into a
 * workflow and the chain route becomes valid again automatically; unwire it and
 * every chain-only gate is reported. Nothing here hardcodes today's answer.
 *
 * DANGLING CHAIN REFERENCE (same contract): `bun run check:grammar-v` sat in the
 * check:ci chain naming a script that does not exist — the script is
 * check:grammar-v2. `bun run` on an undefined name exits 1, so local check:ci
 * died mid-chain, and check:grammar-v2 fell out of the chain and became a NEW
 * ORPHAN. Both facts were true on main and neither was visible, because of the
 * paragraph above. A name that resolves to no script is now RED in its own
 * right: it is a gate invocation that cannot invoke a gate.
 *
 * A workflow "invokes" a gate if a run: body names it by `check:<name>` OR by
 * the SCRIPT PATH its command runs. storybook.yml runs check:stories by PATH
 * (`bun scripts/check-required-stories.ts`), not by name — matching only the
 * name would mis-flag a correctly-wired gate as an orphan.
 *
 * TWO PARSE TRAPS, both of which flip a TRUE finding into a FALSE one (the
 * self-test below reproduces each before trusting the scan):
 *   1. COMMENTS ARE NOT INVOCATIONS. plan-a.yml MENTIONS check:agent-conformance
 *      in a YAML comment ("NOT here — see the lesson-refs job"). That is not a
 *      run step. We read ONLY `run:` step bodies, and strip shell `#` comments.
 *   2. `on.push.paths` FILTERS LIST SCRIPT PATHS (e.g. scripts/check-required-
 *      stories.ts) but do not RUN them. Same fix: only `run:` bodies count.
 *
 * DEBT, NOT A HARD FAIL (slice-0 idiom, docs/plans/slice-0-invariants): two
 * gates are orphaned on main today (check:hmr, check:hydration-adoption) and
 * this contract's SURFACE forbids rewiring them. So the orphan set is locked
 * against a committed baseline: exit 0 iff current === baseline. A NEW orphan
 * is red and named; a baseline orphan that gets WIRED is ALSO red (forces the
 * baseline decrement into the same PR as the fix). The baseline is printed as
 * DEBT every run so it cannot go quiet.
 *
 * SURFACE (C-FEL-428): this meta-check + its baseline only. It does NOT rewrite
 * or rewire any individual gate to fix what it finds.
 *
 * NEGATIVE FIXTURE (ruling 1): a gate is PROVEN only if its red command is
 * EXECUTED in this run and observed to exit non-zero — declared/registered is
 * not enough (that would be green-by-construction, the meta-gate becoming an
 * instance of its own subject). Gates not yet proven are grandfathered into a
 * SHRINK-ONLY ramp (scripts/gate-fixture-baseline.json) so this does not require
 * rewriting ~20 gates on day one; the ramp can only shrink as gates opt in. See
 * NEGATIVE_FIXTURES below.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Glob } from 'bun'

const REPO_ROOT = join(import.meta.dir, '..')

// Pure chains (not gates) are excluded: check:ci / check:pre-push / check:thesis
// only orchestrate other check:*; they have no assertion of their own.
const EXCLUDE_CHAINS = new Set(['check:ci', 'check:pre-push', 'check:thesis'])
// Fixers (scripts that WRITE/regenerate rather than assert) must not be
// enumerated as gates that have to go red. This set is EMPTY BY CONSTRUCTION and
// must stay that way: the repo's writers are `check` (biome check --write .),
// `format`, `readme:remeasure` and `release:version` — NONE is a check:* leaf,
// so the check:*-prefixed enumeration already excludes every one of them. This
// list exists only for a HYPOTHETICAL future check:* that writes; do NOT
// populate it to "tidy up" an empty set. (C-FEL-428 ruling 2.)
const EXCLUDE_FIXERS = new Set<string>([])

// A fixture subprocess (used to prove a gate's negative path — see below) sets
// this so it runs the reachability half ONLY and does not recurse into the
// negative-fixture half that spawned it.
const NO_FIXTURES = Boolean(process.env.GATE_WIRING_NO_FIXTURES)
// The reachability baseline path is overridable so a proof run can point the
// meta-check at an EMPTY baseline (turning the real orphans into "new" ones) and
// observe it go red — the meta-gate proving its own detector actually fires.
const REACH_BASELINE = process.env.GATE_WIRING_BASELINE ?? 'scripts/gate-wiring-baseline.json'

/**
 * NEGATIVE-FIXTURE REGISTRY (C-FEL-428, ruling 1). A gate counts as PROVEN only
 * if the command here is EXECUTED in this run and OBSERVED to exit non-zero —
 * not declared, not registered. Day-one this proves the meta-check ITSELF (the
 * meta-gate is not exempt from its own rule): run it against an EMPTY baseline
 * so the real orphans become "new" and it MUST go red; a detector that found
 * nothing would exit 0 and be caught as unproven. Every other gate is
 * grandfathered into the SHRINK-ONLY not-yet-proven baseline
 * (scripts/gate-fixture-baseline.json). A gate opts in by adding a
 * fixture-invocation entry here — future work, since THIS contract's surface
 * forbids rewriting the individual gates to expose a fixture-scan mode.
 */
interface Fixture {
  /** Red input: MUST exit non-zero, or the gate cannot go red. */
  cmd: string[]
  env?: Record<string, string>
  /**
   * Optional GREEN control on a near-identical input: MUST exit 0.
   *
   * Why (C-FEL-GATE-WIRING-RUNS): "exited non-zero" alone does not prove the
   * gate DISCRIMINATES. A fixture that is red because the gate crashed, or
   * because the fixture tree is malformed in some way unrelated to the property
   * under test, satisfies the red half perfectly and proves nothing — a gate
   * that says "no" to everything is as useless as one that says "yes" to
   * everything. Pair the red input with a control differing in EXACTLY the
   * property being asserted. For check:moon-graph the two trees are identical
   * but for one `dependsOn: ['beta']` line.
   *
   * Optional so this does not invalidate the day-one proof below, whose control
   * is structural: the same command runs against the REAL baseline on every
   * other invocation of this file and is required to exit 0 for it to proceed.
   */
  green?: { cmd: string[]; env?: Record<string, string> }
}

const NEGATIVE_FIXTURES: Record<string, Fixture> = {
  'check:gate-wiring': {
    cmd: ['bun', 'scripts/check-gate-wiring.ts'],
    env: {
      GATE_WIRING_NO_FIXTURES: '1',
      GATE_WIRING_BASELINE: 'scripts/fixtures/gate-wiring/empty-baseline.json',
    },
  },
  // First gate to leave the shrink-only ramp — it was never ON it. #671 added
  // check:moon-graph with no proof and no ramp entry, which check:gate-wiring
  // reports as `GATE WITH NO NEGATIVE-FIXTURE PROOF and not grandfathered`. That
  // went unseen for the whole life of the gate because check:gate-wiring ran in
  // no workflow. `MOON_GRAPH_ROOT` (added with this entry) repoints its scan at
  // a fixture tree; it changes WHERE the gate reads and nothing else.
  'check:moon-graph': {
    cmd: ['bun', 'scripts/check-moon-graph.ts'],
    env: { MOON_GRAPH_ROOT: 'scripts/fixtures/moon-graph/should-flag' },
    green: {
      cmd: ['bun', 'scripts/check-moon-graph.ts'],
      env: { MOON_GRAPH_ROOT: 'scripts/fixtures/moon-graph/should-not-flag' },
    },
  },
}

interface Baseline {
  orphans: string[]
}

function readScripts(): Record<string, string> {
  return JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).scripts ?? {}
}

/** Script paths a command actually runs (for reachability-by-path). */
function scriptPathsOf(cmd: string): string[] {
  return [...cmd.matchAll(/(?:scripts|skills|packages)\/[\w./@-]+\.(?:ts|sh|js|mjs)/g)].map(
    (m) => m[0],
  )
}

/** Gate names: check:* minus pure chains minus the fixer. */
function gateNames(scripts: Record<string, string>): string[] {
  return Object.keys(scripts).filter(
    (k) => k.startsWith('check:') && !EXCLUDE_CHAINS.has(k) && !EXCLUDE_FIXERS.has(k),
  )
}

/** check:* names the check:ci chain transitively invokes. */
function chainReachable(scripts: Record<string, string>): Set<string> {
  const seen = new Set<string>()
  const visit = (name: string) => {
    if (seen.has(name)) return
    seen.add(name)
    const cmd = scripts[name] ?? ''
    for (const m of cmd.matchAll(/bun run (check:[a-z0-9:-]+)/g)) visit(m[1])
  }
  visit('check:ci')
  return seen
}

/**
 * Does any workflow `run:` body actually invoke `check:ci`? The chain route is
 * only meaningful if one does. Negative lookahead so `check:ci-something` (a
 * DIFFERENT script) cannot be mistaken for it — `\b` would not do, because the
 * `-` that follows is a non-word char and would satisfy the boundary.
 */
function ciChainIsWired(workflowRunText: string): boolean {
  return /check:ci(?![\w:-])/.test(workflowRunText)
}

/**
 * Every `bun run <name>` in package.json whose <name> is not a defined script.
 * `bun run` exits 1 on an undefined name, so such a reference silently truncates
 * whatever chain contains it AND drops the gate it was meant to name.
 *
 * TWO REAL SHAPES this must not misread, both present in this package.json and
 * both of which turn a true finding into a false one:
 *   1. `bun run --cwd apps/storybook storybook` — the name is resolved against
 *      apps/storybook/package.json, NOT root's. There is nothing here to check
 *      it against, so a --cwd invocation is SKIPPED, not reported. Reading
 *      `--cwd` (or `apps/storybook`) as the script name yields three dangling
 *      refs that do not exist, and a meta-check that cries wolf gets muted —
 *      the same end state as not running at all.
 *   2. `bun run test packages/app/tests/x.test.ts` — trailing ARGUMENTS follow
 *      the script name. Only the first non-flag token is a script name.
 */
function danglingRunRefs(scripts: Record<string, string>): { from: string; name: string }[] {
  const out: { from: string; name: string }[] = []
  for (const [from, cmd] of Object.entries(scripts)) {
    // One shell segment per `bun run`; `&&`/`;`/`|` end an invocation's args.
    for (const seg of cmd.split(/&&|\|\||;|\|/)) {
      const tokens = seg.trim().split(/\s+/)
      const at = tokens.findIndex((t, i) => t === 'run' && tokens[i - 1] === 'bun')
      if (at === -1) continue
      const rest = tokens.slice(at + 1)
      if (rest.includes('--cwd')) continue // resolved against another manifest
      const name = rest.find((t) => !t.startsWith('-'))
      if (name && !(name in scripts)) out.push({ from, name })
    }
  }
  return out
}

/** Strip a shell `#` comment so a commented mention is not read as a command. */
function stripShellComment(line: string): string {
  return line.replace(/(^|\s)#.*$/, '')
}

/**
 * The executed shell text of a workflow: the concatenation of every `run:`
 * step body (inline and block-scalar), with comments removed. Deliberately
 * ignores everything else — `on.push.paths` filters, `name:`, `if:`, YAML
 * comments — so only genuine invocations count.
 */
function runBodiesOf(yamlText: string): string {
  const lines = yamlText.split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)(?:-\s+)?run:\s*(.*)$/)
    if (!m) continue
    const indent = m[1].length
    const inline = m[2].trim()
    if (inline && !/^[|>]/.test(inline)) {
      out.push(stripShellComment(inline))
      continue
    }
    // block scalar: gather lines indented deeper than the `run:` key
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() === '') continue
      const bIndent = lines[j].match(/^(\s*)/)![1].length
      if (bIndent <= indent) break
      out.push(stripShellComment(lines[j]))
    }
  }
  return out.join('\n')
}

function allWorkflowRunText(): string {
  // Scan INSIDE the workflows dir: Bun's Glob skips the dot-dir `.github`
  // unless matched from within it, which would silently return zero files and
  // make every non-check:ci gate a false orphan (the exact wrong-meta-gate
  // failure this contract exists to prevent — caught by running it).
  const dir = join(REPO_ROOT, '.github/workflows')
  const glob = new Glob('*.yml')
  const files = [...glob.scanSync({ cwd: dir })]
  if (files.length === 0) {
    console.error(
      'check:gate-wiring: found no .github/workflows/*.yml — refusing to pass vacuously.',
    )
    process.exit(1)
  }
  return files.map((f) => runBodiesOf(readFileSync(join(dir, f), 'utf8'))).join('\n')
}

/** Reachable by check:ci chain (by name) OR by a workflow run: (name OR path). */
function isReachable(
  gate: string,
  cmd: string,
  chain: Set<string>,
  workflowRunText: string,
): boolean {
  if (chain.has(gate)) return true
  if (workflowRunText.includes(gate)) return true
  return scriptPathsOf(cmd).some((p) => workflowRunText.includes(p))
}

/**
 * Self-test — the meta-check's own negative fixture. Proves the reachability
 * logic CAN flag an orphan (should-flag) AND does not flag a wired gate
 * (should-not-flag), AND reproduces both parse traps, BEFORE it is trusted on
 * the real tree. A meta-check with no failing case is exactly what it exists to
 * forbid, so it must demonstrate its own on every run (exits 1 if the self-test
 * is wrong).
 */
function selfTest(): void {
  const fail = (msg: string) => {
    console.error(`check:gate-wiring SELF-TEST FAILED — ${msg}`)
    process.exit(1)
  }
  const chain = new Set(['check:ci', 'check:real'])
  // should-not-flag: a gate in the chain is reachable
  if (!isReachable('check:real', 'bun scripts/real.ts', chain, '')) fail('chain gate flagged')
  // should-flag: a gate in neither route is an orphan
  if (isReachable('check:orphan', 'bun scripts/orphan.ts', new Set(['check:ci']), '')) {
    fail('orphan gate not flagged')
  }
  // reachable by PATH only (the storybook.yml/check:stories case)
  if (
    !isReachable(
      'check:byPath',
      'bun scripts/thing.ts',
      new Set(['check:ci']),
      'run body: bun scripts/thing.ts',
    )
  ) {
    fail('path-only reachability missed')
  }
  // TRAP 1: a YAML comment mention is NOT an invocation
  const commentOnly = runBodiesOf(
    '    # note: bun run check:ghost is not here\n    - run: echo hi\n',
  )
  if (commentOnly.includes('check:ghost')) fail('comment counted as invocation (trap 1)')
  // TRAP 2: an on.push.paths entry is NOT an invocation
  const pathsOnly = runBodiesOf(
    "on:\n  push:\n    paths:\n      - 'scripts/ghost.ts'\njobs:\n  x:\n    steps:\n      - run: echo hi\n",
  )
  if (pathsOnly.includes('scripts/ghost.ts')) fail('paths-filter counted as invocation (trap 2)')
  // a real run: block-scalar IS captured
  const realRun = runBodiesOf('    - run: |\n        bun scripts/ghost.ts\n        echo done\n')
  if (!realRun.includes('scripts/ghost.ts')) fail('block-scalar run body missed')

  // ── chain route is conditional (C-FEL-GATE-WIRING-RUNS) ────────────────────
  if (ciChainIsWired('bun run check:lint')) fail('chain route active with no check:ci invocation')
  if (ciChainIsWired('bun run check:cico')) fail('check:cico misread as check:ci')
  if (!ciChainIsWired('- run: bun run check:ci')) fail('a real check:ci invocation not detected')
  if (!ciChainIsWired('bun run check:ci\n')) fail('check:ci at end-of-line not detected')

  // ── dangling `bun run` reference ───────────────────────────────────────────
  const d = (s: Record<string, string>) => danglingRunRefs(s).map((x) => x.name)
  // should-flag: the real main defect — check:grammar-v vs check:grammar-v2
  if (
    !d({ 'check:ci': 'bun run check:grammar-v', 'check:grammar-v2': 'bun x.ts' }).includes(
      'check:grammar-v',
    )
  ) {
    fail('dangling reference not flagged')
  }
  // should-not-flag: a defined name
  if (d({ 'check:ci': 'bun run check:real', 'check:real': 'bun x.ts' }).length) {
    fail('defined script flagged as dangling')
  }
  // should-not-flag: --cwd resolves against another manifest (trap 1)
  if (d({ storybook: 'bun run --cwd apps/storybook storybook' }).length) {
    fail('--cwd invocation flagged (other manifest)')
  }
  // should-not-flag: trailing args are not script names (trap 2)
  if (d({ test: 'vitest', t: 'bun run test packages/app/tests/x.test.ts --config y.ts' }).length) {
    fail('trailing argument read as a script name')
  }
}

interface NegResult {
  proven: Set<string>
  /** fixture ran but the gate did NOT reject it (exit 0) — a gate that cannot go red. */
  passed: string[]
  /** green control ran but the gate rejected it too — the gate does not discriminate. */
  indiscriminate: string[]
  ms: number
}

/**
 * Execute each registered negative fixture and OBSERVE its exit code. A gate is
 * proven iff its fixture command exits NON-ZERO in this run (executed and
 * observed — ruling 1). A fixture that exits 0 means the gate did not reject its
 * own red input: it cannot go red, the exact green-by-construction defect this
 * meta-check exists to kill.
 */
function proveNegativeFixtures(gates: string[]): NegResult {
  const proven = new Set<string>()
  const passed: string[] = []
  const indiscriminate: string[] = []
  const start = performance.now()
  const run = (cmd: string[], env?: Record<string, string>) =>
    Bun.spawnSync(cmd, {
      cwd: REPO_ROOT,
      env: { ...process.env, ...(env ?? {}) },
      stdout: 'ignore',
      stderr: 'ignore',
    }).exitCode
  for (const g of gates) {
    const entry = NEGATIVE_FIXTURES[g]
    if (!entry) continue
    if (run(entry.cmd, entry.env) === 0) {
      passed.push(g)
      continue
    }
    // Red observed. If a green control is declared, the gate must ACCEPT it —
    // otherwise the red proves only that the gate says no to everything.
    if (entry.green && run(entry.green.cmd, entry.green.env) !== 0) {
      indiscriminate.push(g)
      continue
    }
    proven.add(g)
  }
  return { proven, passed, indiscriminate, ms: performance.now() - start }
}

function main(): void {
  selfTest()

  const scripts = readScripts()
  const gates = gateNames(scripts)
  // Floor: a parse failure that finds no gates must not pass vacuously.
  if (gates.length < 10) {
    console.error(
      `check:gate-wiring: only ${gates.length} gates enumerated — package.json parse looks wrong; refusing to pass vacuously.`,
    )
    process.exit(1)
  }

  const workflowRunText = allWorkflowRunText()
  // The chain route counts ONLY if a workflow actually invokes check:ci.
  const ciWired = ciChainIsWired(workflowRunText)
  const chain = ciWired ? chainReachable(scripts) : new Set<string>()

  const orphans = gates.filter((g) => !isReachable(g, scripts[g], chain, workflowRunText)).sort()

  const baseline: Baseline = JSON.parse(readFileSync(join(REPO_ROOT, REACH_BASELINE), 'utf8'))
  const baseSet = new Set(baseline.orphans)
  const newOrphans = orphans.filter((g) => !baseSet.has(g))
  const fixed = baseline.orphans.filter((g) => !orphans.includes(g))

  console.log(
    `check:gate-wiring — ${gates.length} gates, ${orphans.length} orphaned (baseline ${baseline.orphans.length}).`,
  )
  console.log(
    `  check:ci chain route: ${ciWired ? 'ACTIVE (a workflow run: step invokes check:ci)' : 'INERT (no workflow invokes check:ci — chain membership proves nothing)'}`,
  )
  console.log('  KNOWN-ORPHAN DEBT (reachable by neither check:ci nor any workflow run: step):')
  for (const g of baseline.orphans) console.log(`    - ${g}`)

  let bad = false
  const dangling = danglingRunRefs(scripts)
  if (dangling.length) {
    bad = true
    console.error('\n  DANGLING `bun run` REFERENCE — names a script that does not exist:')
    for (const d of dangling) console.error(`    - ${d.from}  ->  bun run ${d.name}`)
    console.error(
      '  `bun run <undefined>` exits 1, so this truncates its chain and drops whatever gate it meant to name.',
    )
  }
  if (newOrphans.length) {
    bad = true
    console.error('\n  NEW ORPHAN(S) — a gate that no CI path invokes protects nothing:')
    for (const g of newOrphans) {
      console.error(`    - ${g}  (${scripts[g]})`)
    }
    console.error(
      '  Wire it into check:ci or its own always-on workflow job — do NOT baseline it away.',
    )
  }
  if (fixed.length) {
    bad = true
    console.error('\n  BASELINE ORPHAN NOW WIRED — decrement the baseline in this same PR:')
    for (const g of fixed) console.error(`    - ${g}`)
    console.error(
      '  Remove it from scripts/gate-wiring-baseline.json so the debt cannot silently regrow.',
    )
  }

  // A fixture subprocess runs the reachability half ONLY and returns — it must
  // not recurse into the negative-fixture half that spawned it.
  if (NO_FIXTURES) {
    if (bad) process.exit(1)
    return
  }
  if (bad) process.exit(1)
  console.log('  All gates reachable except the known baseline debt. OK.')

  // ── NEGATIVE-FIXTURE HALF (executed and observed, ruling 1) ────────────────
  const { proven, passed, indiscriminate, ms } = proveNegativeFixtures(gates)
  const notYetProven: string[] = JSON.parse(
    readFileSync(join(REPO_ROOT, 'scripts/gate-fixture-baseline.json'), 'utf8'),
  ).notYetProven
  const nyp = new Set(notYetProven)
  // Every gate must be PROVEN this run or grandfathered into the ramp.
  const unaccounted = gates.filter((g) => !proven.has(g) && !nyp.has(g)).sort()
  // A gate now proven but still listed as debt: the shrink-only baseline is stale.
  const provenButBaselined = notYetProven.filter((g) => proven.has(g)).sort()

  console.log(
    `\n  NEGATIVE FIXTURE — executed ${proven.size} proof(s) in ${(ms / 1000).toFixed(1)}s; ${notYetProven.length} gate(s) not yet proven (shrink-only ramp debt).`,
  )
  if (ms > 120_000) {
    console.log(
      '  NOTE: executed-fixture wall-clock > 120s — split the execution half into its own always-on job and report the number to the orchestrator.',
    )
  }

  let badFix = false
  // Floor: if NOTHING was executed, the executed-and-observed invariant is
  // untested this run — the green-by-construction shape this half exists to
  // forbid. A meta-check that can silently observe nothing must fail, not pass.
  if (proven.size === 0) {
    badFix = true
    console.error('\n  NO negative-fixture proof executed — the mechanism is unverified this run.')
  }
  if (passed.length) {
    badFix = true
    console.error(
      '\n  NEGATIVE FIXTURE PASSED — the gate did NOT reject its own red input (it cannot go red):',
    )
    for (const g of passed) console.error(`    - ${g}`)
  }
  if (indiscriminate.length) {
    badFix = true
    console.error(
      '\n  FIXTURE RED **AND** GREEN CONTROL RED — the gate rejects everything, so its red proves nothing:',
    )
    for (const g of indiscriminate) console.error(`    - ${g}`)
  }
  if (unaccounted.length) {
    badFix = true
    console.error('\n  GATE WITH NO NEGATIVE-FIXTURE PROOF and not grandfathered:')
    for (const g of unaccounted) console.error(`    - ${g}`)
    console.error(
      '  Add an executed proof to NEGATIVE_FIXTURES — the not-yet-proven baseline is SHRINK-ONLY.',
    )
  }
  if (provenButBaselined.length) {
    badFix = true
    console.error(
      '\n  GATE NOW PROVEN but still in the not-yet-proven baseline — remove it (shrink-only):',
    )
    for (const g of provenButBaselined) console.error(`    - ${g}`)
  }

  if (badFix) process.exit(1)
  console.log('  All gates either proven or grandfathered into the shrink-only ramp. OK.')
}

main()
