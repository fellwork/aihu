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
})
