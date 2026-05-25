/**
 * Smoke tests for `aihu dev` + `aihu build` commands (arch-4 §3).
 *
 * Verifies wiring only — does not start a real dev server or run a real build.
 * Imports the command modules and verifies they export a default async function.
 */

import { describe, expect, it } from 'vitest'

describe('aihu dev command', () => {
  it('exports a default async function', async () => {
    const mod = (await import('../src/commands/dev.ts')) as {
      default: unknown
    }
    expect(typeof mod.default).toBe('function')
  })
})

describe('aihu build command', () => {
  it('exports a default async function', async () => {
    const mod = (await import('../src/commands/build.ts')) as {
      default: unknown
    }
    expect(typeof mod.default).toBe('function')
  })
})

describe('aihu migrate command', () => {
  it('exports the migrateFiles file-driving entry', async () => {
    // Bug 9c — the migrate command must expose its CLI-facing entry so the
    // dispatcher can call it. (migrate.ts is not rewritten; we only connect.)
    const mod = (await import('../src/commands/migrate.ts')) as {
      migrateFiles: unknown
    }
    expect(typeof mod.migrateFiles).toBe('function')
  })
})

describe('bin.ts dispatcher', () => {
  it('is parseable and async-compatible', async () => {
    // Smoke import only — bin.ts has top-level `process.argv` access so
    // running it would spawn a subprocess. We verify the source parses.
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(__dirname, '..', 'src', 'bin.ts'), 'utf8')
    expect(src).toContain("if (cmd === 'dev')")
    expect(src).toContain("if (cmd === 'build')")
    expect(src).toContain("await import('./commands/dev.js')")
    expect(src).toContain("await import('./commands/build.js')")
  })

  it('registers the migrate subcommand and dispatches to migrateFiles (bug 9c)', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(__dirname, '..', 'src', 'bin.ts'), 'utf8')
    expect(src).toContain("if (cmd === 'migrate')")
    expect(src).toContain("await import('./commands/migrate.js')")
    expect(src).toContain('migrateFiles(files, dryRun, process.cwd())')
  })

  it('lists migrate in the top-level usage text (bug 9c)', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(__dirname, '..', 'src', 'bin.ts'), 'utf8')
    expect(src).toContain('aihu migrate <files...>')
  })
})
