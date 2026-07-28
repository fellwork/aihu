#!/usr/bin/env bun
/**
 * check-gate-wiring.ts — C-FEL-428 gate-wiring meta-check (REACHABILITY half).
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
 * SCOPE: this is the REACHABILITY half. The NEGATIVE-FIXTURE half (every gate
 * ships a fixture it actually rejects) is pending the mechanism ruling — see
 * the C-FEL-428 verdict/design note on the bus.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Glob } from 'bun'

const REPO_ROOT = join(import.meta.dir, '..')

// Pure chains (not gates) and the fixer are excluded from enumeration.
// check:ci / check:pre-push / check:thesis only orchestrate other check:*; they
// have no assertion of their own. FIXER: no check:* leaf in this repo writes /
// regenerates (verified: none call writeFileSync), so the set is empty today —
// if a fixer check is later added, list it here so it is not enumerated as a
// gate that must go red.
const EXCLUDE_CHAINS = new Set(['check:ci', 'check:pre-push', 'check:thesis'])
const EXCLUDE_FIXERS = new Set<string>([])

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

  const chain = chainReachable(scripts)
  const workflowRunText = allWorkflowRunText()

  const orphans = gates.filter((g) => !isReachable(g, scripts[g], chain, workflowRunText)).sort()

  const baseline: Baseline = JSON.parse(
    readFileSync(join(REPO_ROOT, 'scripts/gate-wiring-baseline.json'), 'utf8'),
  )
  const baseSet = new Set(baseline.orphans)
  const newOrphans = orphans.filter((g) => !baseSet.has(g))
  const fixed = baseline.orphans.filter((g) => !orphans.includes(g))

  console.log(
    `check:gate-wiring — ${gates.length} gates, ${orphans.length} orphaned (baseline ${baseline.orphans.length}).`,
  )
  console.log('  KNOWN-ORPHAN DEBT (reachable by neither check:ci nor any workflow run: step):')
  for (const g of baseline.orphans) console.log(`    - ${g}`)

  let bad = false
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

  if (bad) process.exit(1)
  console.log('  All gates reachable except the known baseline debt. OK.')
}

main()
