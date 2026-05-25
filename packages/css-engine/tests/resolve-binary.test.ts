import { chmodSync, copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { compile, isUsableExecutable } from '../src/index.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Regression for the css-engine binary-resolution EACCES bug:
//
// R6c pinned the per-platform packages (@aihu/css-engine-<platform>) as
// optionalDependencies, and a bun.lock refresh made their in-source PLACEHOLDER
// `aihu-css-compile` resolvable inside the workspace. The old resolveBinary()
// accepted the candidate on existsSync alone — so it returned a non-executable
// placeholder and later died with EACCES inside execFileSync, never reaching the
// dev `target/` fallback. The fix gates the candidate on isUsableExecutable():
// a present-but-non-executable / zero-byte stub is rejected and we fall through.
describe('@aihu/css-engine — isUsableExecutable (stub vs real binary)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aihu-css-resolve-'))
  afterAll(() => rmSync(tmp, { recursive: true, force: true }))

  it('rejects a zero-byte placeholder (the resolvable stub case)', () => {
    const stub = join(tmp, 'aihu-css-compile-empty')
    writeFileSync(stub, '')
    expect(isUsableExecutable(stub)).toBe(false)
  })

  it('rejects a non-executable text placeholder on POSIX', () => {
    const stub = join(tmp, 'aihu-css-compile-stub')
    writeFileSync(stub, 'placeholder')
    if (process.platform !== 'win32') {
      // Clear all exec bits so accessSync(X_OK) fails — the linux CI scenario.
      chmodSync(stub, 0o644)
      expect(isUsableExecutable(stub)).toBe(false)
    } else {
      // Windows has no execute bit; a non-empty regular file is treated as
      // runnable, so this branch is exercised by the zero-byte case above.
      expect(isUsableExecutable(stub)).toBe(true)
    }
  })

  it('rejects a missing path', () => {
    expect(isUsableExecutable(join(tmp, 'does-not-exist'))).toBe(false)
  })

  it('accepts the real dev target/ binary (the fallback the engine lands on)', () => {
    const ext = process.platform === 'win32' ? '.exe' : ''
    const real = resolveExisting([
      resolve(__dirname, '../../../target/release', `aihu-css-compile${ext}`),
      resolve(__dirname, '../../../target/debug', `aihu-css-compile${ext}`),
    ])
    expect(real, 'build it with: cargo build --release -p aihu-css-core').not.toBeNull()
    expect(isUsableExecutable(real as string)).toBe(true)

    // And a copy of it stays usable (proves it is the executability — not the
    // path — that the gate keys on).
    const copy = join(tmp, `aihu-css-compile-copy${ext}`)
    copyFileSync(real as string, copy)
    if (process.platform !== 'win32') chmodSync(copy, 0o755)
    expect(isUsableExecutable(copy)).toBe(true)
  })

  it('compile() still works — resolveBinary() lands on a usable binary', () => {
    // With the platform stub present in the workspace AND target/ built, this
    // must NOT throw EACCES: resolveBinary() rejects the stub and falls through
    // (or, on a machine whose stub carries a real exe, uses that). Either way it
    // resolves a usable executable and produces CSS.
    const out = compile(['bg-primary'])
    expect(out).toContain('var(--color-primary)')
  })
})

function resolveExisting(paths: string[]): string | null {
  for (const p of paths) {
    if (existsSync(p)) return p
  }
  return null
}
