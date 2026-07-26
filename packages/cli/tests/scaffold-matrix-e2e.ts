#!/usr/bin/env bun
/**
 * Scaffold DX matrix — the end-to-end first-impression harness.
 *
 * `npm create aihu` is the first command a developer ever runs against this
 * project. Everything downstream of it (install → typecheck → build → dev
 * server → production preview) is the first-impression path, and until this
 * file existed none of it was covered past `bun run build` on bun alone:
 *
 *   - `scaffold-npm-e2e.ts`     bun only, stops at a `dist/` existence check,
 *                               never starts a server.
 *   - `scaffold-default-e2e.ts` in-process `scaffoldApp()` from local source.
 *
 * This harness runs the full grid instead:
 *
 *   package managers  bun | npm | pnpm | yarn
 *   scaffold paths    create-aihu templates  minimal | full | docs | agent
 *                     `aihu app --template`  cf-team  (resolved FROM npm)
 *
 * and every cell is driven all the way to a *serving HTTP server*: the dev
 * server and the production preview server must each answer 200 with a
 * non-empty HTML body before the cell is allowed to pass.
 *
 * ── Design rules this file is built around ──────────────────────────────────
 *
 *  1. Everything runs in a temp dir with NO aihu ancestor. `resolveTemplatePackagePath()`
 *     (packages/cli/src/bin.ts) falls back to walking up for
 *     `packages/templates/<short>` — run inside the monorepo, that fallback
 *     silently substitutes the workspace template and masks a broken npm
 *     publish entirely. `assertNoAihuAncestor()` refuses to start if the temp
 *     root is anywhere under a checkout.
 *  2. A hang is never a pass. Every command and every server wait is bounded
 *     by an explicit timeout, and readiness is established by *polling the HTTP
 *     endpoint until it answers*, never by sleeping. On timeout the server's
 *     captured stdout+stderr is printed.
 *  3. Ports are ephemeral and per-cell, and children are spawned into their own
 *     process group so the whole group can be killed on every path — success,
 *     failure, throw, and process-level SIGINT/SIGTERM.
 *  4. Assertions are on exit codes and response bodies. Nothing in this file
 *     decides pass/fail by grepping log text: a substring match against an
 *     error message reads as success, which is how a harness ends up green on
 *     a broken release.
 *  5. One cell's failure never aborts the matrix. Results are collected, the
 *     grid is printed, and the process exits non-zero if any cell failed.
 *  6. A step that cannot run is `skip` or `n/a` with a printed reason. It is
 *     never silently counted as a pass.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *
 *   # published-npm mode (the default) — what a real user gets, today
 *   bun packages/cli/tests/scaffold-matrix-e2e.ts
 *   bun packages/cli/tests/scaffold-matrix-e2e.ts --version 1.0.1
 *
 *   # local-source mode — build packages/cli and drive its dist/ directly
 *   bun packages/cli/tests/scaffold-matrix-e2e.ts --mode local
 *
 *   # slice the grid
 *   bun packages/cli/tests/scaffold-matrix-e2e.ts --pm bun,npm --template minimal
 *   bun packages/cli/tests/scaffold-matrix-e2e.ts --keep     # leave temp dirs
 *
 *   # try a candidate fix WITHOUT editing the published scaffold: patch extra
 *   # dependencies into the emitted package.json before install. Cells run this
 *   # way are marked `*` in the grid and are NOT evidence the scaffold works.
 *   bun packages/cli/tests/scaffold-matrix-e2e.ts --extra-dep @aihu/store@0.1.1
 */

import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Pm = 'bun' | 'npm' | 'pnpm' | 'yarn'
type Mode = 'npm' | 'local'
type StepStatus = 'pass' | 'fail' | 'skip' | 'n/a'

/** Which of the two genuinely different scaffold systems a template goes through. */
type ScaffoldKind =
  /** `create-aihu` — templates compiled INTO @aihu/cli, never fetched from npm. */
  | 'create'
  /** `aihu app --template <id>` — template package resolved FROM npm at @latest. */
  | 'app-template'

interface StepResult {
  readonly name: string
  readonly status: StepStatus
  readonly ms: number
  /** Populated for `fail` (full context) and for `skip`/`n/a` (the reason). */
  readonly detail?: string
}

interface CellResult {
  readonly template: string
  readonly pm: Pm
  readonly steps: StepResult[]
  status: 'pass' | 'fail' | 'skip'
  dir?: string
}

/** How a template is scaffolded and how its servers are driven. */
interface TemplateSpec {
  readonly id: string
  readonly kind: ScaffoldKind
  /** For `app-template`: the short id passed to `aihu app --template <id>`. */
  readonly templateArg?: string
  /** Directory (relative to the project root) whose package.json owns the scripts. */
  readonly workdir: string
  /** Script names; `null` means the template does not ship that script. */
  readonly typecheckScript: string | null
  readonly buildScript: string | null
  readonly devScript: string | null
  readonly previewScript: string | null
  /**
   * `'flag'`  — the port can be threaded through as `-- --port N --strictPort`.
   * `number`  — the template HARDCODES this port; cells cannot be parallelised
   *             and repeated runs collide. Recorded as a finding, not hidden.
   * `null`    — no controllable port.
   */
  readonly devPort: 'flag' | number | null
  readonly previewPort: 'flag' | number | null
  /** PMs whose server phases cannot run; value is the reason printed as `n/a`. */
  readonly serverOnlyOnPm?: { readonly pms: readonly Pm[]; readonly reason: string }
  /** Extra flags appended to the scaffold command. */
  readonly extraScaffoldArgs?: readonly string[]
  /**
   * External binaries this template's own scripts shell out to. If one is not
   * on PATH the whole cell is SKIPPED, not failed.
   *
   * A cell that cannot run is not a cell that failed. The harness already knew
   * cf-team needs `moon` — it said so in `notes` — but the gate did not act on
   * what it knew, so every run went red for a missing tool and the check became
   * a permanently-red X that gated nothing. That trains people to scroll past
   * failing checks, which is worse than either a green gate or no gate.
   *
   * Same treatment missing package managers already get: reported loudly as
   * NOT tested and NOT passing, never silently counted as a pass.
   */
  readonly requiresBin?: readonly string[]
  readonly notes?: string
}

// ---------------------------------------------------------------------------
// Template registry
// ---------------------------------------------------------------------------

const VITE_APP = {
  workdir: '.',
  typecheckScript: 'typecheck',
  buildScript: 'build',
  devScript: 'dev',
  previewScript: 'preview',
  devPort: 'flag',
  previewPort: 'flag',
} as const

const TEMPLATES: readonly TemplateSpec[] = [
  { id: 'minimal', kind: 'create', ...VITE_APP },
  { id: 'full', kind: 'create', ...VITE_APP },
  { id: 'docs', kind: 'create', ...VITE_APP },
  {
    id: 'agent',
    kind: 'create',
    ...VITE_APP,
    // `dev` is `concurrently "bun run server" "vite --port 5108"`. Trailing args
    // land on concurrently, not on vite, so the port is NOT threadable — and the
    // bridge server hardcodes 5208 in vite.config.ts on top of that.
    devPort: 5108,
    // `bun run server` inside the dev script makes the dev phase bun-only no
    // matter which PM the user scaffolded with.
    serverOnlyOnPm: {
      pms: ['bun'],
      reason: 'dev script shells out to `bun server.ts`; requires bun on PATH regardless of --pm',
    },
    notes: 'hardcodes vite:5108 + bridge:5208 — cells cannot run in parallel',
  },
  {
    id: 'cf-team',
    kind: 'app-template',
    templateArg: 'cf-team',
    workdir: '.',
    typecheckScript: 'typecheck',
    buildScript: 'build',
    devScript: 'dev',
    previewScript: null,
    // Root `dev` is `moon run apps/web:dev`; nothing threads a port through moon.
    devPort: null,
    previewPort: null,
    serverOnlyOnPm: {
      pms: ['bun'],
      reason: 'template declares engines.bun and its scripts shell out to `bun run vite` via moon',
    },
    requiresBin: ['moon'],
    notes: 'bun-workspaces + moon monorepo; requires `moon` on PATH',
  },
]

/** True when `bin` resolves on PATH. Used to skip, never to silently pass. */
function binExists(bin: string): boolean {
  return spawnSync(bin, ['--version'], { stdio: 'ignore', shell: false }).status === 0
}

const ALL_PMS: readonly Pm[] = ['bun', 'npm', 'pnpm', 'yarn']

// ---------------------------------------------------------------------------
// Argv
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2)

function flagValue(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`)
  if (i !== -1) return argv[i + 1]
  const eq = argv.find((a) => a.startsWith(`--${name}=`))
  return eq?.slice(name.length + 3)
}
const mode: Mode = (flagValue('mode') as Mode) ?? 'npm'
const version = flagValue('version') ?? 'latest'
const keepDirs = argv.includes('--keep')
const cmdTimeoutMs = Number(flagValue('cmd-timeout') ?? 300_000)
const serverTimeoutMs = Number(flagValue('server-timeout') ?? 120_000)

/**
 * Dependencies patched into the emitted package.json before install, for
 * evaluating a candidate fix against the real published scaffold. Cells run
 * with this set are flagged `*` in the grid — they prove a fix would work, not
 * that the shipped scaffold works.
 */
const extraDeps = (
  flagValue('extra-dep')
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean) ?? []
).map((spec) => {
  const at = spec.lastIndexOf('@')
  if (at <= 0) throw new Error(`--extra-dep expects name@version, got ${JSON.stringify(spec)}`)
  return [spec.slice(0, at), spec.slice(at + 1)] as const
})

const wantPms = (flagValue('pm')
  ?.split(',')
  .map((s) => s.trim()) ?? ALL_PMS) as Pm[]
const wantTemplates = flagValue('template')
  ?.split(',')
  .map((s) => s.trim())
const templates = wantTemplates ? TEMPLATES.filter((t) => wantTemplates.includes(t.id)) : TEMPLATES

if (mode !== 'npm' && mode !== 'local') {
  process.stderr.write(`--mode must be 'npm' or 'local', got ${JSON.stringify(mode)}\n`)
  process.exit(2)
}
if (templates.length === 0) {
  process.stderr.write(
    `--template matched nothing; known: ${TEMPLATES.map((t) => t.id).join(', ')}\n`,
  )
  process.exit(2)
}

// ---------------------------------------------------------------------------
// Output helpers (mirrors the step()/run() idiom in scaffold-npm-e2e.ts)
// ---------------------------------------------------------------------------

const out = (s: string): void => void process.stdout.write(s)
const bold = (s: string): string => `[1m${s}[0m`
const dim = (s: string): string => `[2m${s}[0m`

/** Raised by a step so the cell runner can record it without aborting the matrix. */
class StepError extends Error {
  constructor(
    message: string,
    readonly detail: string,
  ) {
    super(message)
  }
}

interface RunResult {
  readonly status: number | null
  readonly stdout: string
  readonly stderr: string
  readonly timedOut: boolean
}

/**
 * Run a command to completion. Fails on a non-zero exit code — never on a
 * substring of the log — and folds the full command, exit code, stdout and
 * stderr into the error so a failing cell prints something actionable.
 */
function run(
  label: string,
  cmd: string,
  args: string[],
  cwd: string,
  timeout = cmdTimeoutMs,
): RunResult {
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: 'pipe',
    encoding: 'utf8',
    shell: false,
    timeout,
    env: { ...process.env, CI: '1', NO_COLOR: '1', FORCE_COLOR: '0' },
  })
  const timedOut = res.signal === 'SIGTERM' && res.error !== undefined
  const result: RunResult = {
    status: res.status,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    timedOut,
  }
  if (res.error && !timedOut) {
    throw new StepError(
      `${label}: could not spawn`,
      describe(cmd, args, cwd, null, result.stdout, `${res.error.message}\n${result.stderr}`),
    )
  }
  if (timedOut) {
    throw new StepError(
      `${label}: timed out after ${timeout}ms`,
      describe(cmd, args, cwd, null, result.stdout, result.stderr),
    )
  }
  if (res.status !== 0) {
    throw new StepError(
      `${label}: exit ${res.status}`,
      describe(cmd, args, cwd, res.status, result.stdout, result.stderr),
    )
  }
  return result
}

function describe(
  cmd: string,
  args: string[],
  cwd: string,
  status: number | null,
  stdout: string,
  stderr: string,
  url?: string,
): string {
  return [
    `command : ${cmd} ${args.join(' ')}`,
    `cwd     : ${cwd}`,
    ...(url ? [`url     : ${url}`] : []),
    `exit    : ${status ?? '(none)'}`,
    `--- stdout ---`,
    tail(stdout),
    `--- stderr ---`,
    tail(stderr),
  ].join('\n')
}

/** Keep failure dumps readable: last N lines, which is where the error lives. */
function tail(s: string, lines = 40): string {
  const t = s.trimEnd()
  if (t === '') return '(empty)'
  const split = t.split('\n')
  return split.length <= lines
    ? t
    : `… (${split.length - lines} earlier lines elided)\n${split.slice(-lines).join('\n')}`
}

// ---------------------------------------------------------------------------
// Requirement 1 — the temp root must have no aihu ancestor
// ---------------------------------------------------------------------------

/**
 * Refuse to run anywhere under an aihu checkout.
 *
 * Inside the monorepo, `aihu app --template cf-team` resolves the template from
 * `packages/templates/cf-team` on disk instead of npm, so a template that was
 * never published — or published broken — still scaffolds perfectly. Every
 * result produced from such a directory is worthless.
 */
function assertNoAihuAncestor(startDir: string): void {
  let dir = resolve(startDir)
  for (;;) {
    if (existsSync(join(dir, 'packages', 'templates'))) {
      throw new Error(
        `refusing to run: ${startDir} is under an aihu-shaped checkout at ${dir} ` +
          `(packages/templates/ found). The CLI's workspace fallback would mask a broken publish.`,
      )
    }
    const pkgPath = join(dir, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string }
        if (pkg.name === 'aihu' || pkg.name?.startsWith('@aihu/')) {
          throw new Error(
            `refusing to run: ${startDir} is under an aihu package at ${dir} (name=${pkg.name}).`,
          )
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('refusing to run')) throw e
        // Unparseable package.json is not our problem — keep walking.
      }
    }
    const parent = dirname(dir)
    if (parent === dir) return
    dir = parent
  }
}

// ---------------------------------------------------------------------------
// Package-manager detection
// ---------------------------------------------------------------------------

interface PmInfo {
  readonly pm: Pm
  readonly available: boolean
  readonly version: string
  readonly major: number
}

function probePm(pm: Pm): PmInfo {
  const r = spawnSync(pm, ['--version'], {
    stdio: 'pipe',
    encoding: 'utf8',
    shell: false,
    timeout: 30_000,
  })
  if (r.status !== 0 || r.error) return { pm, available: false, version: '', major: 0 }
  const version = (r.stdout ?? '').trim()
  return { pm, available: true, version, major: Number.parseInt(version.split('.')[0] ?? '0', 10) }
}

/** `<pm> run <script> -- <extra>`, with yarn's arg-forwarding difference honoured. */
function pmRunArgs(pm: Pm, script: string, extra: readonly string[] = []): string[] {
  if (pm === 'yarn') return ['run', script, ...extra]
  return extra.length > 0 ? ['run', script, '--', ...extra] : ['run', script]
}

function pmInstallArgs(pm: Pm): string[] {
  switch (pm) {
    case 'npm':
      return ['install', '--no-audit', '--no-fund']
    case 'pnpm':
      return ['install', '--no-frozen-lockfile']
    case 'yarn':
      return ['install']
    case 'bun':
      return ['install']
  }
}

// ---------------------------------------------------------------------------
// Ephemeral ports + server lifecycle
// ---------------------------------------------------------------------------

/**
 * Ask the kernel for a free port, then release it. There is an unavoidable
 * window between release and re-bind; every server is therefore started with
 * `--strictPort` so losing that race is a loud bind failure rather than a
 * server quietly listening somewhere we are not probing.
 */
async function ephemeralPort(): Promise<number> {
  return await new Promise((res, rej) => {
    const srv = createServer()
    srv.once('error', rej)
    // Bind dual-stack (no host) rather than 127.0.0.1: vite serves on IPv6
    // `[::1]` by default, so an IPv4-only reservation can hand back a port that
    // is already taken on the interface the server will actually use.
    srv.listen(0, () => {
      const addr = srv.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      srv.close(() => (port === 0 ? rej(new Error('could not allocate port')) : res(port)))
    })
  })
}

/** Every server spawned by this process, so no path can leak one. */
const liveChildren = new Set<ChildProcess>()

/** Kill the child's whole process group. Vite spawns workers; killing the pid alone orphans them. */
function killTree(child: ChildProcess): void {
  liveChildren.delete(child)
  if (child.pid === undefined || child.exitCode !== null) return
  for (const sig of ['SIGTERM', 'SIGKILL'] as const) {
    try {
      process.kill(-child.pid, sig)
    } catch {
      try {
        child.kill(sig)
      } catch {
        /* already gone */
      }
    }
    if (sig === 'SIGTERM' && child.exitCode !== null) return
  }
}

function killAllChildren(): void {
  for (const c of [...liveChildren]) killTree(c)
}
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    killAllChildren()
    process.exit(130)
  })
}
process.on('exit', killAllChildren)

interface ProbeOk {
  readonly url: string
  readonly bodyBytes: number
  readonly contentType: string
}

/**
 * Start a server, poll it until it actually answers, and assert on the RESPONSE
 * — status code, content type, body — not on anything the process logged.
 *
 * Always tears the process group down, including when the assertion throws.
 */
async function serveAndProbe(
  label: string,
  cmd: string,
  args: string[],
  cwd: string,
  port: number,
): Promise<ProbeOk> {
  // Vite's default host is `localhost`, which it binds as IPv6 `[::1]` only —
  // probing `127.0.0.1` alone times out against a server that is up and healthy
  // and reports it as a failure. Try every loopback spelling before concluding
  // anything, and report the one that answered.
  const urls = [`http://127.0.0.1:${port}/`, `http://[::1]:${port}/`, `http://localhost:${port}/`]
  const url = urls.join(' | ')
  let stdout = ''
  let stderr = ''

  const child = spawn(cmd, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    detached: true, // own process group → killTree can take the whole tree down
    env: { ...process.env, CI: '1', NO_COLOR: '1', FORCE_COLOR: '0', BROWSER: 'none' },
  })
  liveChildren.add(child)
  child.stdout?.on('data', (c: Buffer) => {
    stdout += c.toString()
  })
  child.stderr?.on('data', (c: Buffer) => {
    stderr += c.toString()
  })

  let exited: { code: number | null; signal: string | null } | undefined
  child.on('exit', (code, signal) => {
    exited = { code, signal }
  })

  const fail = (why: string): never => {
    throw new StepError(
      `${label}: ${why}`,
      describe(cmd, args, cwd, exited?.code ?? null, stdout, stderr, url),
    )
  }

  try {
    const deadline = Date.now() + serverTimeoutMs
    let lastErr = 'never attempted'

    for (;;) {
      // The server dying is terminal — do not keep polling a corpse until the
      // timeout, that turns a crash into an indistinguishable "hang".
      if (exited !== undefined) {
        fail(`server exited (code=${exited.code}, signal=${exited.signal}) before answering ${url}`)
      }
      if (Date.now() > deadline) {
        fail(`server did not answer ${url} within ${serverTimeoutMs}ms (last error: ${lastErr})`)
      }

      let connected = false
      for (const candidate of urls) {
        let res: Response
        let body: string
        try {
          res = await fetch(candidate, {
            signal: AbortSignal.timeout(5_000),
            headers: { accept: 'text/html' },
          })
          body = await res.text()
        } catch (e) {
          lastErr = `${candidate}: ${(e as Error).message}`
          continue // this loopback spelling is not up (yet); try the next
        }

        // Connected. From here every check is an assertion on the RESPONSE —
        // status, content-type, body — and a violation is terminal, not a retry.
        connected = true
        if (res.status !== 200) fail(`${candidate} answered HTTP ${res.status} (expected 200)`)
        if (body.trim().length === 0) fail(`${candidate} answered 200 with an EMPTY body`)
        const contentType = res.headers.get('content-type') ?? ''
        if (!/text\/html/i.test(contentType)) {
          fail(
            `${candidate} answered 200 but content-type is ${JSON.stringify(contentType)}, not text/html`,
          )
        }
        if (!/<(!doctype|html|body|div|script)\b/i.test(body)) {
          fail(
            `${candidate} answered 200 text/html but the body is not HTML:\n${body.slice(0, 400)}`,
          )
        }
        return { url: candidate, bodyBytes: Buffer.byteLength(body), contentType }
      }
      if (!connected) await new Promise((r) => setTimeout(r, 400))
    }
  } finally {
    killTree(child)
  }
}

// ---------------------------------------------------------------------------
// Scaffold command construction — the two different entry paths
// ---------------------------------------------------------------------------

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const localCreateJs = join(repoRoot, 'packages', 'cli', 'dist', 'create.js')
const localBinJs = join(repoRoot, 'packages', 'cli', 'dist', 'bin.js')

/** Path 1: `create-aihu` — templates built INTO @aihu/cli, never fetched from npm. */
function createCommand(
  pm: Pm,
  info: PmInfo,
  spec: TemplateSpec,
  appName: string,
): [string, string[]] {
  const tail = [
    appName,
    '--yes',
    '--template',
    spec.id,
    '--pm',
    pm,
    '--no-git',
    ...(spec.extraScaffoldArgs ?? []),
  ]
  if (mode === 'local') return ['node', [localCreateJs, ...tail]]
  const pkg = `create-aihu@${version}`
  switch (pm) {
    case 'npm':
      // `npm create` needs `--` before the package's own argv.
      return ['npm', ['create', `aihu@${version}`, '--', ...tail]]
    case 'bun':
      return ['bun', ['create', `aihu@${version}`, ...tail]]
    case 'pnpm':
      return ['pnpm', ['create', `aihu@${version}`, ...tail]]
    case 'yarn': {
      if (info.major >= 2) return ['yarn', ['dlx', pkg, ...tail]]
      // yarn 1 resolves `yarn create aihu@1.2.3` to a BINARY literally named
      // `create-aihu@1.2.3`, which never exists — exit 127 before the scaffolder
      // ever runs. That is a yarn 1 defect, not an aihu one, and reporting it as
      // a scaffold failure would bury the real result. Only the unversioned form
      // is meaningful there.
      if (version !== 'latest') {
        throw new StepError(
          'yarn 1 cannot pin a create-package version',
          `yarn ${info.version} resolves \`yarn create aihu@${version}\` to a binary named ` +
            `"create-aihu@${version}" and exits 127 before scaffolding. Re-run with ` +
            `--version latest, or use yarn >= 2 (which has \`yarn dlx\`).`,
        )
      }
      return ['yarn', ['create', 'aihu', ...tail]]
    }
  }
}

/** Path 2: `aihu app --template <id>` — template package resolved FROM npm at @latest. */
function appTemplateCommand(
  pm: Pm,
  info: PmInfo,
  spec: TemplateSpec,
  appName: string,
): [string, string[]] {
  const templateId = spec.templateArg ?? spec.id
  const tail = ['app', appName, '--template', templateId, '--pm', pm]
  if (mode === 'local') return ['node', [localBinJs, ...tail]]

  // npm/npx CANNOT run `@aihu/cli`'s `aihu` bin (FEL-422): npx infers the
  // executable from the package NAME, looks for a bin called `cli`, finds
  // `aihu` and `create-aihu` instead, and refuses to guess —
  //     npm error could not determine executable to run
  // `bunx` resolves differently, which is why this is npm-only and why a
  // bun-only harness could never have surfaced it.
  //
  // `create-aihu` is the entry point npm users actually reach, and as of the
  // create-aihu template work its `--template` spans BOTH tiers — built-ins
  // and the npm-published `@aihu/templates-*` packages. So npm drives the npm
  // template tier through the command a real npm user would run, not through
  // one that cannot execute.
  const createTail = [appName, '--template', templateId, '--pm', pm]
  const cliPkg = `@aihu/cli@${version}`
  const createPkg = `create-aihu@${version}`
  switch (pm) {
    case 'npm':
      return ['npx', ['-y', createPkg, ...createTail]]
    case 'bun':
      return ['bunx', [cliPkg, ...tail]]
    case 'pnpm':
      return ['pnpm', ['dlx', createPkg, ...createTail]]
    case 'yarn':
      // yarn 1 has no dlx; fall back to npx and say so in the notes.
      return info.major >= 2
        ? ['yarn', ['dlx', createPkg, ...createTail]]
        : ['npx', ['-y', createPkg, ...createTail]]
  }
}

// ---------------------------------------------------------------------------
// Cell runner
// ---------------------------------------------------------------------------

const STEP_NAMES = ['scaffold', 'install', 'typecheck', 'build', 'dev', 'preview'] as const

async function runCell(spec: TemplateSpec, info: PmInfo, parentDir: string): Promise<CellResult> {
  const pm = info.pm
  const cell: CellResult = { template: spec.id, pm, steps: [], status: 'pass' }
  const appName = `m-${spec.id}-${pm}`.toLowerCase().replace(/[^a-z0-9-]/g, '-')
  const projectDir = join(parentDir, appName)
  cell.dir = projectDir

  out(`\n${bold(`▶ cell ${spec.id} × ${pm}`)} ${dim(projectDir)}\n`)

  // A cell that cannot run is not a cell that failed. Report it loudly as
  // untested rather than red — and never as a pass.
  const missing = (spec.requiresBin ?? []).filter((b) => !binExists(b))
  if (missing.length > 0) {
    cell.status = 'skip'
    out(
      `  ${bold('SKIP')}  ${spec.id} needs ${missing.join(', ')} on PATH — ` +
        `NOT tested, NOT passing\n`,
    )
    return cell
  }

  /** A step body may return nothing (pass) or a reasoned non-applicable verdict. */
  type StepOutcome = void | { status: StepStatus; detail: string }

  /** Run one step, recording pass/fail/skip/n-a. Later steps skip once the cell is dead. */
  let dead = false
  const step = async (
    name: string,
    fn: () => Promise<StepOutcome> | StepOutcome,
  ): Promise<void> => {
    if (dead) {
      cell.steps.push({ name, status: 'skip', ms: 0, detail: 'earlier step failed' })
      out(`  ${dim(`- ${name} (skipped — earlier step failed)`)}\n`)
      return
    }
    const t0 = Date.now()
    try {
      const res = await fn()
      const ms = Date.now() - t0
      if (res && typeof res === 'object') {
        cell.steps.push({ name, status: res.status, ms, detail: res.detail })
      } else {
        cell.steps.push({ name, status: 'pass', ms })
      }
      const last = cell.steps[cell.steps.length - 1]!
      const glyph = last.status === 'pass' ? '✓' : last.status === 'n/a' ? '·' : '-'
      out(
        `  ${glyph} ${name} ${dim(`${last.status} ${ms}ms`)}${last.detail ? dim(` — ${last.detail}`) : ''}\n`,
      )
    } catch (err) {
      const ms = Date.now() - t0
      const detail =
        err instanceof StepError
          ? `${err.message}\n${err.detail}`
          : ((err as Error).stack ?? String(err))
      cell.steps.push({ name, status: 'fail', ms, detail })
      cell.status = 'fail'
      dead = true
      out(`  ✘ ${name} ${dim(`fail ${ms}ms`)}\n`)
    }
  }

  // Typed escape hatch so a step body can return a reasoned n/a.
  const na = (detail: string): { status: StepStatus; detail: string } => ({
    status: 'n/a' as const,
    detail,
  })

  // ── 1. scaffold ───────────────────────────────────────────────────────────
  await step('scaffold', () => {
    const [cmd, args] =
      spec.kind === 'create'
        ? createCommand(pm, info, spec, appName)
        : appTemplateCommand(pm, info, spec, appName)
    run('scaffold', cmd, args, parentDir)
    if (!existsSync(projectDir)) {
      throw new StepError(
        'scaffold',
        describe(cmd, args, parentDir, 0, '', `${projectDir} was not created`),
      )
    }
    if (!existsSync(join(projectDir, 'package.json'))) {
      throw new StepError(
        'scaffold',
        describe(cmd, args, parentDir, 0, '', `${projectDir}/package.json missing`),
      )
    }
  })

  const workdir = join(projectDir, spec.workdir)
  const scriptsOf = (): Record<string, string> => {
    try {
      const pkg = JSON.parse(readFileSync(join(workdir, 'package.json'), 'utf8')) as {
        scripts?: Record<string, string>
      }
      return pkg.scripts ?? {}
    } catch {
      return {}
    }
  }

  // ── 2. install ────────────────────────────────────────────────────────────
  await step(`install (${pm})`, () => {
    if (extraDeps.length > 0 && !dead) {
      const pkgPath = join(workdir, 'package.json')
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
        dependencies?: Record<string, string>
      }
      pkg.dependencies = { ...(pkg.dependencies ?? {}), ...Object.fromEntries(extraDeps) }
      writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
      out(
        `    ${dim(`! patched --extra-dep into package.json: ${extraDeps.map(([n, v]) => `${n}@${v}`).join(', ')}`)}\n`,
      )
    }
    run('install', pm, pmInstallArgs(pm), projectDir)
  })

  // ── 3. typecheck ──────────────────────────────────────────────────────────
  await step('typecheck', () => {
    if (spec.typecheckScript === null) return na('template ships no typecheck script')
    if (!(spec.typecheckScript in scriptsOf()))
      return na(`no "${spec.typecheckScript}" script in package.json`)
    run('typecheck', pm, pmRunArgs(pm, spec.typecheckScript), workdir)
  })

  // ── 4. build ──────────────────────────────────────────────────────────────
  await step('build', () => {
    if (spec.buildScript === null) return na('template ships no build script')
    if (!(spec.buildScript in scriptsOf()))
      return na(`no "${spec.buildScript}" script in package.json`)
    run('build', pm, pmRunArgs(pm, spec.buildScript), workdir)
  })

  // ── 5. dev server: must answer 200 + non-empty HTML ───────────────────────
  await step('dev (HTTP 200)', async () => {
    if (spec.devScript === null) return na('template ships no dev script')
    if (!(spec.devScript in scriptsOf())) return na(`no "${spec.devScript}" script in package.json`)
    if (spec.serverOnlyOnPm && !spec.serverOnlyOnPm.pms.includes(pm)) {
      return na(spec.serverOnlyOnPm.reason)
    }
    if (spec.devPort === null) return na('no way to thread a port through this dev script')

    let port: number
    let extra: string[]
    if (spec.devPort === 'flag') {
      port = await ephemeralPort()
      extra = ['--port', String(port), '--strictPort']
    } else {
      // Hardcoded port: run it, but never pretend it is collision-safe.
      port = spec.devPort
      extra = []
      out(`    ${dim(`! template hardcodes dev port ${port}; this cell is not parallel-safe`)}\n`)
    }
    const probe = await serveAndProbe(
      'dev',
      pm,
      pmRunArgs(pm, spec.devScript, extra),
      workdir,
      port,
    )
    out(`    ${dim(`${probe.url} → 200 ${probe.contentType} ${probe.bodyBytes}B`)}\n`)
  })

  // ── 6. production/preview server: must answer 200 + non-empty HTML ────────
  await step('preview (HTTP 200)', async () => {
    if (spec.previewScript === null) return na('template ships no preview/production-server script')
    if (!(spec.previewScript in scriptsOf()))
      return na(`no "${spec.previewScript}" script in package.json`)
    if (spec.serverOnlyOnPm && !spec.serverOnlyOnPm.pms.includes(pm)) {
      return na(spec.serverOnlyOnPm.reason)
    }
    if (spec.previewPort === null) return na('no way to thread a port through this preview script')

    const port = spec.previewPort === 'flag' ? await ephemeralPort() : spec.previewPort
    const extra = spec.previewPort === 'flag' ? ['--port', String(port), '--strictPort'] : []
    const probe = await serveAndProbe(
      'preview',
      pm,
      pmRunArgs(pm, spec.previewScript, extra),
      workdir,
      port,
    )
    out(`    ${dim(`${probe.url} → 200 ${probe.contentType} ${probe.bodyBytes}B`)}\n`)
  })

  if (cell.status !== 'fail') cell.status = 'pass'
  return cell
}

// ---------------------------------------------------------------------------
// Grid rendering
// ---------------------------------------------------------------------------

function renderGrid(results: readonly CellResult[], skipped: readonly PmInfo[]): void {
  const glyph: Record<StepStatus, string> = { pass: 'ok', fail: 'FAIL', skip: '-', 'n/a': 'n/a' }
  const cols = ['template', 'pm', ...STEP_NAMES]
  const rows = results.map((c) => {
    const byName = (n: string): string => {
      const s = c.steps.find((x) => x.name === n || x.name.startsWith(`${n} `))
      return s ? glyph[s.status] : '-'
    }
    return [c.template + (extraDeps.length > 0 ? '*' : ''), c.pm, ...STEP_NAMES.map(byName)]
  })
  const widths = cols.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)))
  const line = (cells: string[]): string => cells.map((c, i) => c.padEnd(widths[i]!)).join('  ')

  out(`\n${bold('══ scaffold DX matrix ══')}\n`)
  out(`mode=${mode}  version=${mode === 'npm' ? version : '(local source)'}\n\n`)
  out(`${bold(line(cols))}\n`)
  out(`${widths.map((w) => '─'.repeat(w)).join('  ')}\n`)
  for (const r of rows) out(`${line(r)}\n`)

  out(
    `\n${bold('legend')}  ok=passed  FAIL=failed  n/a=not applicable (reason below)  -=skipped after an earlier failure\n`,
  )
  if (extraDeps.length > 0) {
    out(
      `${bold('*')} these cells were run with --extra-dep ` +
        `${extraDeps.map(([n, v]) => `${n}@${v}`).join(', ')} patched in — they show what a FIXED\n` +
        `  scaffold would do, and are NOT evidence that the published scaffold works.\n`,
    )
  }

  if (skipped.length > 0) {
    out(`\n${bold('SKIPPED PACKAGE MANAGERS')}\n`)
    for (const s of skipped)
      out(`  SKIP  ${s.pm} — not installed on this machine; NOT tested, NOT passing\n`)
  }

  const naSteps = results.flatMap((c) =>
    c.steps
      .filter((s) => s.status === 'n/a')
      .map((s) => `  n/a   ${c.template} × ${c.pm} · ${s.name} — ${s.detail}`),
  )
  if (naSteps.length > 0) {
    out(`\n${bold('NOT APPLICABLE')}\n${naSteps.join('\n')}\n`)
  }

  const failures = results.filter((c) => c.status === 'fail')
  if (failures.length > 0) {
    out(`\n${bold('FAILURES')}\n`)
    for (const c of failures) {
      for (const s of c.steps.filter((x) => x.status === 'fail')) {
        out(`\n${bold(`✘ ${c.template} × ${c.pm} · ${s.name}`)}\n`)
        out(`${s.detail ?? '(no detail)'}\n`)
      }
    }
  }

  const notes = templates.filter((t) => t.notes).map((t) => `  note  ${t.id} — ${t.notes}`)
  if (notes.length > 0) out(`\n${bold('TEMPLATE NOTES')}\n${notes.join('\n')}\n`)

  const pass = results.filter((c) => c.status === 'pass').length
  out(
    `\n${bold('SUMMARY')}  ${pass}/${results.length} cells passed` +
      `${failures.length > 0 ? `, ${failures.length} failed` : ''}` +
      `${skipped.length > 0 ? `, ${skipped.length} package manager(s) skipped` : ''}\n`,
  )
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  const parentDir = mkdtempSync(join(tmpdir(), 'aihu-dx-matrix-'))

  // Requirement 1 — bail loudly rather than produce meaningless green.
  assertNoAihuAncestor(parentDir)

  out(`${bold('aihu scaffold DX matrix')}\n`)
  out(
    `mode      : ${mode}${mode === 'npm' ? ` (published, @${version})` : ` (local source: ${repoRoot})`}\n`,
  )
  out(`temp root : ${parentDir}  ${dim('(verified: no aihu ancestor)')}\n`)
  out(`templates : ${templates.map((t) => t.id).join(', ')}\n`)

  if (mode === 'local') {
    if (!existsSync(localCreateJs) || !existsSync(localBinJs)) {
      out(`\nBuilding @aihu/cli (dist/ missing)…\n`)
      run('build @aihu/cli', 'bun', ['run', 'build'], join(repoRoot, 'packages', 'cli'))
    }
    for (const f of [localCreateJs, localBinJs]) {
      if (!existsSync(f)) {
        out(`\nFATAL — local mode needs ${f}; build packages/cli first.\n`)
        return 2
      }
    }
  }

  const probed = wantPms.map((pm) => probePm(pm))
  const available = probed.filter((p) => p.available)
  const missing = probed.filter((p) => !p.available)

  out(`pms       : ${available.map((p) => `${p.pm}@${p.version}`).join(', ') || '(none!)'}\n`)
  for (const m of missing) {
    out(`${bold('SKIP')}      ${m.pm} — not installed; this row is NOT tested and NOT a pass\n`)
  }
  if (available.length === 0) {
    out('\nFATAL — no package managers available.\n')
    return 2
  }

  const results: CellResult[] = []
  try {
    // Deliberately serial: parallel cells fight over the npm/pnpm/yarn caches,
    // and the `agent` template hardcodes its ports.
    for (const spec of templates) {
      for (const info of available) {
        try {
          results.push(await runCell(spec, info, parentDir))
        } catch (err) {
          // Requirement 5 — a cell blowing up outside a step never aborts the grid.
          results.push({
            template: spec.id,
            pm: info.pm,
            steps: [
              {
                name: 'scaffold',
                status: 'fail',
                ms: 0,
                detail: (err as Error).stack ?? String(err),
              },
            ],
            status: 'fail',
          })
        }
      }
    }
  } finally {
    killAllChildren()
    renderGrid(results, missing)
    if (keepDirs) {
      out(`\n${dim(`--keep: temp tree left at ${parentDir}`)}\n`)
    } else {
      rmSync(parentDir, { recursive: true, force: true })
    }
  }

  return results.some((c) => c.status === 'fail') ? 1 : 0
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    out(`\nFATAL — ${(err as Error).stack ?? String(err)}\n`)
    killAllChildren()
    process.exit(2)
  })
