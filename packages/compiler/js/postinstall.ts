/**
 * Postinstall hook for @aihu/compiler.
 *
 * Resolution order (first match wins):
 *
 *   1. SCRIBE_SKIP_POSTINSTALL=1     → no-op, exit 0.
 *   2. Binary already present at     → arch-validate it; if compatible no-op
 *      bin/aihu-compile<ext> OR        exit 0, if incompatible (e.g. a Linux
 *      target/release/aihu-compile<ext> ELF that leaked into the tarball on a
 *                                       macOS host) delete it and fall through.
 *   3. SCRIBE_COMPILE_BIN=<path>     → copy that path → bin/, exit 0.
 *   4. GitHub Releases download      → bin/aihu-compile<ext>, verify SHA256,
 *                                       exit 0. (arch-4 §4.3 — sidecar
 *                                       verification implemented v1.1.)
 *   5. Local `cargo build --release` → target/release/aihu-compile<ext>,
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
 * imports a `@aihu/*` sibling. Compile-time failure (when the user
 * actually invokes the compiler without a binary) is acceptable and
 * recoverable; install-time failure is not.
 *
 * Hard-fail exit 1 is reserved for these cases:
 *   - SCRIBE_COMPILE_BIN is set but points at a missing file (user error,
 *     surface immediately rather than silently swallow).
 *   - SHA256 verification of a downloaded binary fails (integrity violation —
 *     do NOT run a tampered binary).
 *   - Catastrophic unexpected exception (programming error in this script).
 *
 * Local dev override: if SCRIBE_COMPILE_BIN env var is set, that path is
 * used instead of downloading. This lets contributors who built from
 * source via `cargo build --release` point the compiler at their build.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

interface AssetMapping {
  asset: string
  ext: '' | '.exe'
}

function resolveAsset(platform: NodeJS.Platform, arch: string): AssetMapping | null {
  if (platform === 'darwin' && arch === 'arm64') {
    return { asset: 'aihu-compile-darwin-arm64', ext: '' }
  }
  if (platform === 'darwin' && arch === 'x64') {
    return { asset: 'aihu-compile-darwin-x64', ext: '' }
  }
  if (platform === 'linux' && arch === 'x64') {
    return { asset: 'aihu-compile-linux-x64', ext: '' }
  }
  // arch-4 §4.2 — aarch64-linux added in v1.1 release matrix.
  if (platform === 'linux' && arch === 'arm64') {
    return { asset: 'aihu-compile-linux-arm64', ext: '' }
  }
  if (platform === 'win32' && arch === 'x64') {
    return { asset: 'aihu-compile-windows-x64.exe', ext: '.exe' }
  }
  return null
}

const TAG = '[@aihu/compiler postinstall]'

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
  status?: number
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
      status: response.status,
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

/**
 * Verify a downloaded binary's SHA256 digest against the matching `.sha256`
 * sidecar from GitHub Releases (arch-4 §4.3).
 *
 * Returns true on match, false on any failure (network, mismatch, parse).
 * The caller decides whether to fail hard or fall through; for download path
 * a mismatch is hardFail (integrity violation), other reasons soft-warn.
 */
async function verifySha256(
  binaryPath: string,
  sidecarUrl: string,
): Promise<{ ok: boolean; reason?: string; expected?: string; actual?: string }> {
  let response: Response
  try {
    response = await fetch(sidecarUrl, { redirect: 'follow' })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return { ok: false, reason: `sidecar network error: ${detail}` }
  }
  if (!response.ok) {
    return {
      ok: false,
      reason: `sidecar HTTP ${response.status} ${response.statusText}`,
    }
  }
  const sidecarText = (await response.text()).trim()
  // Sidecar format: hex digest (lowercase, 64 chars). Some tools prepend a filename;
  // accept either `<hash>` or `<hash>  <name>` and extract the first whitespace-delimited token.
  const expected = sidecarText.split(/\s+/)[0]?.toLowerCase()
  if (!expected || !/^[0-9a-f]{64}$/i.test(expected)) {
    return {
      ok: false,
      reason: `malformed sidecar (expected 64-char hex, got "${sidecarText.slice(0, 80)}")`,
    }
  }

  let actual: string
  try {
    const fileBuf = readFileSync(binaryPath)
    actual = createHash('sha256').update(fileBuf).digest('hex')
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return { ok: false, reason: `local hash failed: ${detail}` }
  }

  if (actual !== expected) {
    return { ok: false, reason: 'digest mismatch', expected, actual }
  }
  return { ok: true }
}

/**
 * Inspect a binary's file-format magic bytes and (where cheaply available) its
 * architecture field. The point is to catch a wrong-arch binary sitting on disk
 * BEFORE we hand it to spawn() and ENOEXEC the user (see PR description: a
 * Linux x86-64 ELF can ship inside the tarball when the publisher's machine
 * left one in bin/, and arch-blind idempotency then traps it).
 *
 * Returns `null` if the file can't be read; format `'unknown'` for headers we
 * don't recognise (e.g. shell scripts, FAT/universal Mach-O — those callers
 * conservatively treat as compatible).
 */
function inspectBinary(
  path: string,
): { format: 'elf' | 'macho' | 'macho-fat' | 'pe' | 'unknown'; arch: string | null } | null {
  let fd: number | null = null
  try {
    fd = openSync(path, 'r')
    const buf = Buffer.alloc(20)
    const bytesRead = readSync(fd, buf, 0, 20, 0)
    if (bytesRead < 20) return null

    // ELF: 0x7F 'E' 'L' 'F'
    if (buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) {
      // e_machine at offset 18 (u16, endianness per EI_DATA at offset 5).
      const littleEndian = buf[5] === 1
      const machine = littleEndian ? buf.readUInt16LE(18) : buf.readUInt16BE(18)
      const arch =
        machine === 0x3e ? 'x64' : machine === 0xb7 ? 'arm64' : machine === 0x03 ? 'ia32' : null
      return { format: 'elf', arch }
    }

    const magic = buf.readUInt32LE(0)
    // Mach-O 64-bit LE-on-disk magic. cputype at offset 4 (u32 LE).
    if (magic === 0xfeedfacf) {
      const cputype = buf.readUInt32LE(4)
      const arch =
        cputype === 0x01000007 ? 'x64' : cputype === 0x0100000c ? 'arm64' : null
      return { format: 'macho', arch }
    }
    // Mach-O FAT/universal (multi-arch). On-disk bytes are big-endian per spec;
    // a little-endian read yields 0xBEBAFECA.
    if (magic === 0xbebafeca || magic === 0xcafebabe) {
      return { format: 'macho-fat', arch: null }
    }

    // PE (Windows): 'MZ' at offset 0. Skip detailed machine parse — Windows
    // arch mismatches are rare and not the bug we're fixing here.
    if (buf[0] === 0x4d && buf[1] === 0x5a) {
      return { format: 'pe', arch: null }
    }

    return { format: 'unknown', arch: null }
  } catch {
    return null
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd)
      } catch {
        /* swallow */
      }
    }
  }
}

function expectedFormatFor(platform: NodeJS.Platform): 'elf' | 'macho' | 'pe' | null {
  if (platform === 'darwin') return 'macho'
  if (platform === 'win32') return 'pe'
  if (platform === 'linux') return 'elf'
  return null
}

/**
 * Decide whether an on-disk binary is safe to keep for the current host.
 * Returns `null` when compatible; otherwise a short reason string suitable for
 * a warn-level log. `'unknown'` format is treated as compatible (avoid breaking
 * exotic but legitimate setups — e.g. a shell wrapper a dev placed here).
 */
function incompatibilityReason(
  path: string,
  platform: NodeJS.Platform,
  arch: string,
): string | null {
  const probe = inspectBinary(path)
  if (!probe) return null
  if (probe.format === 'unknown') return null
  // FAT/universal Mach-O ships multiple slices; trust it on darwin, reject elsewhere.
  if (probe.format === 'macho-fat') {
    return platform === 'darwin' ? null : `universal Mach-O on ${platform}`
  }
  const expected = expectedFormatFor(platform)
  if (expected !== null && probe.format !== expected) {
    return `${probe.format} binary on ${platform} (expected ${expected})`
  }
  if (probe.arch !== null && probe.arch !== arch) {
    return `${probe.arch} binary on ${platform}/${arch}`
  }
  return null
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
  if (process.env.SCRIBE_SKIP_POSTINSTALL) {
    info('SCRIBE_SKIP_POSTINSTALL set; skipping all binary-acquisition steps.')
    return
  }

  const platform = process.platform
  const arch = process.arch

  const mapping = resolveAsset(platform, arch)
  if (!mapping) {
    softExit(
      `unsupported platform: ${platform}/${arch} ` +
        '(supported: darwin/arm64, darwin/x64, linux/x64, linux/arm64, win32/x64).',
    )
  }

  const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const binDir = resolve(pkgDir, 'bin')
  const binPath = resolve(binDir, `aihu-compile${mapping.ext}`)
  const targetReleaseBin = resolve(pkgDir, 'target', 'release', `aihu-compile${mapping.ext}`)

  // Ensure target directory exists before any write operations.
  if (!existsSync(binDir)) {
    mkdirSync(binDir, { recursive: true })
  }

  // Idempotency: nothing to do if a usable binary is already in place at
  // either the released-asset path (bin/) or the local-build path
  // (target/release). "Usable" means the magic bytes match the host
  // platform/arch — without that arch probe a wrong-arch binary sitting in
  // the tarball (e.g. a Linux ELF that leaked from the publisher's machine)
  // short-circuits the download path and ENOEXECs the user at spawn time.
  if (existsSync(binPath)) {
    const reason = incompatibilityReason(binPath, platform, arch)
    if (reason === null) {
      info(`bin already present at ${binPath}, skipping.`)
      return
    }
    warn(`existing ${binPath} is incompatible (${reason}); removing and re-acquiring.`)
    try {
      unlinkSync(binPath)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      warn(`could not remove incompatible binary at ${binPath}: ${detail}. Continuing — download will overwrite.`)
    }
  }
  if (existsSync(targetReleaseBin)) {
    const reason = incompatibilityReason(targetReleaseBin, platform, arch)
    if (reason === null) {
      info(`local cargo build already present at ${targetReleaseBin}, skipping.`)
      return
    }
    warn(`existing ${targetReleaseBin} is incompatible (${reason}); ignoring and acquiring a fresh binary.`)
  }

  // Local dev override — copy a locally built binary instead of downloading.
  const override = process.env.SCRIBE_COMPILE_BIN
  if (override) {
    if (!existsSync(override)) {
      // User explicitly pointed at a path that doesn't exist — fail loudly.
      hardFail(`SCRIBE_COMPILE_BIN points to ${override} but that file does not exist.`)
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
  const baseUrl = `https://github.com/fellwork/aihu/releases/latest/download/${mapping.asset}`
  const sidecarUrl = `${baseUrl}.sha256`
  info(`fetching ${baseUrl}`)
  const downloaded = await tryDownload(baseUrl, binPath)
  if (downloaded.ok) {
    // Verify SHA256 against sidecar before trusting the binary (arch-4 §4.3).
    info(`verifying SHA256 against ${sidecarUrl}`)
    const verified = await verifySha256(binPath, sidecarUrl)
    if (verified.ok) {
      if (platform !== 'win32') {
        chmodSync(binPath, 0o755)
      }
      info(`installed binary at ${binPath} (SHA256 verified).`)
      return
    }
    if (verified.reason === 'digest mismatch') {
      // Integrity violation — DO NOT leave the bad binary on disk.
      try {
        unlinkSync(binPath)
      } catch {
        /* swallow — the next strategy will overwrite */
      }
      hardFail(
        `binary hash verification failed for ${mapping.asset}.\n` +
          `  expected: ${verified.expected ?? '(unknown)'}\n` +
          `  actual:   ${verified.actual ?? '(unknown)'}\n` +
          'Refusing to install a tampered binary. Re-run after the release ' +
          'workflow republishes the asset, or set SCRIBE_COMPILE_BIN to a trusted local build.',
      )
    }
    // Sidecar fetch/parse failures: warn but don't hard-fail (the binary itself downloaded).
    // This lets pre-v1.1 releases (no sidecars) continue to install.
    warn(`SHA256 verification skipped: ${verified.reason}.`)
    if (platform !== 'win32') {
      chmodSync(binPath, 0o755)
    }
    info(`installed binary at ${binPath} (UNVERIFIED — sidecar unavailable).`)
    return
  }

  // 404 on aarch64-linux pre-v1.1 release publish — graceful fallthrough.
  if (downloaded.status === 404 && platform === 'linux' && arch === 'arm64') {
    info(
      'aarch64-linux binary not yet published for this release; falling through to source build.',
    )
  } else {
    warn(`release-binary download from ${baseUrl} failed: ${downloaded.reason}.`)
  }

  // Strategy B — attempt a local Rust build. The Rust crate lives at
  // packages/compiler/Cargo.toml; `cargo build --release` produces the
  // binary at packages/compiler/target/release/aihu-compile<ext>, which
  // is where js/index.ts looks via SCRIBE_COMPILE_BIN ?? '../target/release/...'.
  if (tryLocalBuild(pkgDir)) {
    if (existsSync(targetReleaseBin)) {
      info(`compiler binary built locally at ${targetReleaseBin}.`)
      return
    }
    warn(`cargo build reported success but ${targetReleaseBin} is missing; falling through.`)
  }

  // Strategy C — give up, but DO NOT fail the install. The compiler may be
  // unused in this workspace (e.g. consumers only depend on @aihu/runtime
  // and @aihu/signals). Compile-time invocation will surface a clear
  // error if/when the user actually tries to compile a .aihu file.
  softExit(
    'no compiler binary available after release-download and local-build fallbacks. ' +
      'This is fine if you do not need to compile .aihu files in this workspace.',
  )
}

main().catch((err: unknown) => {
  const detail = err instanceof Error ? (err.stack ?? err.message) : String(err)
  hardFail(`Unexpected failure: ${detail}`)
})
