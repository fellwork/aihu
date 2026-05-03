/**
 * Postinstall hook for @scribe/compiler.
 *
 * Resolution order (first match wins):
 *
 *   1. SCRIBE_SKIP_POSTINSTALL=1     → no-op, exit 0.
 *   2. Binary already present at     → no-op, exit 0.
 *      bin/scribe-compile<ext> OR
 *      target/release/scribe-compile<ext>
 *   3. SCRIBE_COMPILE_BIN=<path>     → copy that path → bin/, exit 0.
 *   4. GitHub Releases download      → bin/scribe-compile<ext>, exit 0.
 *   5. Local `cargo build --release` → target/release/scribe-compile<ext>,
 *                                       exit 0.
 *   6. Everything failed             → log warning, exit 0 anyway. The user
 *                                       will need to either provide
 *                                       SCRIBE_COMPILE_BIN or run
 *                                       `cargo build --release` themselves
 *                                       before invoking the compiler.
 *
 * The hard rule: this script MUST exit 0 in every "no binary acquired"
 * branch. A non-zero exit aborts `bun install`, which prevents workspace
 * symlinks from being created and breaks every downstream package that
 * imports a `@scribe/*` sibling. Compile-time failure (when the user
 * actually invokes the compiler without a binary) is acceptable and
 * recoverable; install-time failure is not.
 *
 * Hard-fail exit 1 is reserved for two cases only:
 *   - SCRIBE_COMPILE_BIN is set but points at a missing file (user error,
 *     surface immediately rather than silently swallow).
 *   - Catastrophic unexpected exception (programming error in this script).
 *
 * Local dev override: if SCRIBE_COMPILE_BIN env var is set, that path is
 * used instead of downloading. This lets contributors who built from
 * source via `cargo build --release` point the compiler at their build.
 *
 * TODO(v1.x): add SHA256 sidecar verification once the release workflow
 * publishes binaries. The release pipeline will need to publish a
 * `<asset>.sha256` next to each binary, and this postinstall should fetch
 * and verify the digest before placing the binary on disk.
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

interface AssetMapping {
  asset: string
  ext: '' | '.exe'
}

function resolveAsset(platform: NodeJS.Platform, arch: string): AssetMapping | null {
  if (platform === 'darwin' && arch === 'arm64') {
    return { asset: 'scribe-compile-darwin-arm64', ext: '' }
  }
  if (platform === 'darwin' && arch === 'x64') {
    return { asset: 'scribe-compile-darwin-x64', ext: '' }
  }
  if (platform === 'linux' && arch === 'x64') {
    return { asset: 'scribe-compile-linux-x64', ext: '' }
  }
  if (platform === 'win32' && arch === 'x64') {
    return { asset: 'scribe-compile-windows-x64.exe', ext: '.exe' }
  }
  return null
}

const TAG = '[@scribe/compiler postinstall]'

function info(msg: string): void {
  process.stdout.write(`${TAG} ${msg}\n`)
}

function warn(msg: string): void {
  process.stderr.write(`${TAG} WARN: ${msg}\n`)
}

function hardFail(msg: string): never {
  process.stderr.write(`${TAG} ERROR: ${msg}\n`)
  process.exit(1)
}

function softExit(msg: string): never {
  warn(msg)
  warn(
    'bun install will continue. To enable the compiler later, set ' +
      'SCRIBE_COMPILE_BIN to a built binary path or run ' +
      '`cargo build --release` from packages/compiler/ when a Rust ' +
      'toolchain is available.',
  )
  process.exit(0)
}

interface DownloadResult {
  ok: boolean
  reason?: string
}

async function tryDownload(url: string, dest: string): Promise<DownloadResult> {
  let response: Response
  try {
    response = await fetch(url, { redirect: 'follow' })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return { ok: false, reason: `network error: ${detail}` }
  }
  if (!response.ok) {
    return {
      ok: false,
      reason: `HTTP ${response.status} ${response.statusText}`,
    }
  }
  let buf: Buffer
  try {
    buf = Buffer.from(await response.arrayBuffer())
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return { ok: false, reason: `body read failed: ${detail}` }
  }
  if (buf.length === 0) {
    return { ok: false, reason: 'response body was empty' }
  }
  try {
    writeFileSync(dest, buf)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return { ok: false, reason: `write failed: ${detail}` }
  }
  return { ok: true }
}

function tryLocalBuild(pkgDir: string): boolean {
  // Check for cargo first — quick probe without spawning a build.
  const probe = spawnSync('cargo', ['--version'], {
    stdio: 'ignore',
    shell: false,
  })
  if (probe.error || probe.status !== 0) {
    info('cargo not available; skipping local Rust build fallback.')
    return false
  }
  info('attempting local `cargo build --release` (Rust toolchain detected)…')
  const build = spawnSync('cargo', ['build', '--release'], {
    cwd: pkgDir,
    stdio: 'inherit',
    shell: false,
  })
  if (build.error || build.status !== 0) {
    warn(
      `local cargo build failed (status=${build.status ?? 'unknown'}). The compiler binary was not built.`,
    )
    return false
  }
  info('local cargo build succeeded.')
  return true
}

async function main(): Promise<void> {
  if (process.env['SCRIBE_SKIP_POSTINSTALL']) {
    info('SCRIBE_SKIP_POSTINSTALL set; skipping all binary-acquisition steps.')
    return
  }

  const platform = process.platform
  const arch = process.arch

  const mapping = resolveAsset(platform, arch)
  if (!mapping) {
    softExit(
      `unsupported platform: ${platform}/${arch} ` +
        '(supported: darwin/arm64, darwin/x64, linux/x64, win32/x64).',
    )
  }

  const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const binDir = resolve(pkgDir, 'bin')
  const binPath = resolve(binDir, `scribe-compile${mapping.ext}`)
  const targetReleaseBin = resolve(
    pkgDir,
    'target',
    'release',
    `scribe-compile${mapping.ext}`,
  )

  // Ensure target directory exists before any write operations.
  if (!existsSync(binDir)) {
    mkdirSync(binDir, { recursive: true })
  }

  // Idempotency: nothing to do if a binary is already in place at either
  // the released-asset path (bin/) or the local-build path (target/release).
  if (existsSync(binPath)) {
    info(`bin already present at ${binPath}, skipping.`)
    return
  }
  if (existsSync(targetReleaseBin)) {
    info(`local cargo build already present at ${targetReleaseBin}, skipping.`)
    return
  }

  // Local dev override — copy a locally built binary instead of downloading.
  const override = process.env['SCRIBE_COMPILE_BIN']
  if (override) {
    if (!existsSync(override)) {
      // User explicitly pointed at a path that doesn't exist — fail loudly.
      hardFail(
        `SCRIBE_COMPILE_BIN points to ${override} but that file does not exist.`,
      )
    }
    copyFileSync(override, binPath)
    if (platform !== 'win32') {
      chmodSync(binPath, 0o755)
    }
    info(`copied ${override} -> ${binPath} (SCRIBE_COMPILE_BIN override).`)
    return
  }

  // Strategy A — try the GitHub Releases `latest/download` redirect.
  // On any failure (404 because no release exists yet, network unavailable,
  // empty response, write failure), fall through to Strategy B without
  // aborting the install.
  const url = `https://github.com/fellwork/scribe/releases/latest/download/${mapping.asset}`
  info(`fetching ${url}`)
  const downloaded = await tryDownload(url, binPath)
  if (downloaded.ok) {
    if (platform !== 'win32') {
      chmodSync(binPath, 0o755)
    }
    info(`installed binary at ${binPath}.`)
    return
  }

  warn(`release-binary download from ${url} failed: ${downloaded.reason}.`)

  // Strategy B — attempt a local Rust build. The Rust crate lives at
  // packages/compiler/Cargo.toml; `cargo build --release` produces the
  // binary at packages/compiler/target/release/scribe-compile<ext>, which
  // is where js/index.ts looks via SCRIBE_COMPILE_BIN ?? '../target/release/...'.
  if (tryLocalBuild(pkgDir)) {
    if (existsSync(targetReleaseBin)) {
      info(`compiler binary built locally at ${targetReleaseBin}.`)
      return
    }
    warn(
      `cargo build reported success but ${targetReleaseBin} is missing; falling through.`,
    )
  }

  // Strategy C — give up, but DO NOT fail the install. The compiler may be
  // unused in this workspace (e.g. consumers only depend on @scribe/runtime
  // and @scribe/signals). Compile-time invocation will surface a clear
  // error if/when the user actually tries to compile a .scribe file.
  softExit(
    'no compiler binary available after release-download and local-build fallbacks. ' +
      'This is fine if you do not need to compile .scribe files in this workspace.',
  )
}

main().catch((err: unknown) => {
  const detail = err instanceof Error ? err.stack ?? err.message : String(err)
  hardFail(`Unexpected failure: ${detail}`)
})
