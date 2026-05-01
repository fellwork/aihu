/**
 * Postinstall hook for @scribe/compiler.
 *
 * Detects the user's platform/arch and downloads the matching pre-built
 * scribe-compile binary from GitHub Releases. The binary is placed at
 * packages/compiler/bin/scribe-compile<ext>.
 *
 * Local dev override: if SCRIBE_COMPILE_BIN env var is set, that path is
 * used instead of downloading. This lets contributors who built from
 * source via `cargo build --release` skip the download.
 *
 * Failure mode: any download failure exits with code 1 and a clear stderr
 * message naming the URL that was attempted. Silent failure is forbidden.
 *
 * TODO(v1): add SHA256 sidecar verification. The release workflow will
 * need to publish a `<asset>.sha256` next to each binary, and this
 * postinstall should fetch and verify the digest before placing the
 * binary on disk.
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
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

function fail(msg: string): never {
  process.stderr.write(`[@scribe/compiler postinstall] ${msg}\n`)
  process.exit(1)
}

async function downloadTo(url: string, dest: string): Promise<void> {
  // Node 18+ ships fetch globally — no extra dependency needed.
  let response: Response
  try {
    response = await fetch(url, { redirect: 'follow' })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    fail(`Network error fetching ${url}: ${detail}`)
  }
  if (!response.ok) {
    fail(`Download failed for ${url}: HTTP ${response.status} ${response.statusText}`)
  }
  const buf = Buffer.from(await response.arrayBuffer())
  if (buf.length === 0) {
    fail(`Download produced empty file from ${url}`)
  }
  writeFileSync(dest, buf)
}

async function main(): Promise<void> {
  const platform = process.platform
  const arch = process.arch

  const mapping = resolveAsset(platform, arch)
  if (!mapping) {
    fail(
      `Unsupported platform: ${platform}/${arch}. ` +
        'Supported: darwin/arm64, darwin/x64, linux/x64, win32/x64.',
    )
  }

  const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const binDir = resolve(pkgDir, 'bin')
  const binPath = resolve(binDir, `scribe-compile${mapping.ext}`)

  // Ensure target directory exists before any write operations.
  if (!existsSync(binDir)) {
    mkdirSync(binDir, { recursive: true })
  }

  // Idempotency: nothing to do if a binary is already in place.
  if (existsSync(binPath)) {
    process.stdout.write(
      `[@scribe/compiler postinstall] bin already present at ${binPath}, skipping.\n`,
    )
    return
  }

  // Local dev override — copy a locally built binary instead of downloading.
  const override = process.env['SCRIBE_COMPILE_BIN']
  if (override) {
    if (!existsSync(override)) {
      fail(`SCRIBE_COMPILE_BIN points to ${override} but that file does not exist.`)
    }
    copyFileSync(override, binPath)
    if (platform !== 'win32') {
      chmodSync(binPath, 0o755)
    }
    process.stdout.write(
      `[@scribe/compiler postinstall] copied ${override} -> ${binPath} (override).\n`,
    )
    return
  }

  // Download via the GitHub Releases `latest/download` redirect.
  const url = `https://github.com/fellwork/scribe/releases/latest/download/${mapping.asset}`
  process.stdout.write(`[@scribe/compiler postinstall] fetching ${url}\n`)
  await downloadTo(url, binPath)
  if (platform !== 'win32') {
    chmodSync(binPath, 0o755)
  }
  process.stdout.write(`[@scribe/compiler postinstall] installed binary at ${binPath}.\n`)
}

main().catch((err: unknown) => {
  const detail = err instanceof Error ? err.stack ?? err.message : String(err)
  fail(`Unexpected failure: ${detail}`)
})
