/**
 * E2E test for the default `aihu app <name>` scaffold (no --template flag).
 *
 * Calls scaffoldApp() against a tmp dir, then shells out to the real package
 * manager + Vite to verify the emitted project actually installs and builds.
 * Network-dependent: runs `bun install` against npm.
 *
 * Gated behind AIHU_SCAFFOLD_E2E=1 so it doesn't slow the default `bun test`
 * loop. CI runs it explicitly when validating cli releases.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scaffoldApp } from '../src/index.ts'

const RUN_E2E = process.env.AIHU_SCAFFOLD_E2E === '1'

describe.skipIf(!RUN_E2E)('default scaffold e2e', () => {
  let parentDir: string

  beforeEach(() => {
    parentDir = mkdtempSync(join(tmpdir(), 'aihu-default-e2e-'))
  })

  afterEach(() => {
    if (parentDir) rmSync(parentDir, { recursive: true, force: true })
  })

  it('emits a buildable project: install + typecheck + build all succeed', () => {
    const result = scaffoldApp('my-app', parentDir)

    // Sanity: every expected file landed (this also documents the contract).
    const want = [
      'package.json',
      'vite.config.ts',
      'tsconfig.json',
      'index.html',
      'src/pages/index.aihu',
      '.vscode/extensions.json',
      '.vscode/settings.json',
    ]
    for (const f of want) {
      expect(result.created).toContain(f)
    }
    // src/main.ts is deliberately NOT scaffolded — viteAihuPlugin's
    // aihu-entry sub-plugin injects a virtual equivalent (see appMainTs's
    // doc comment for the escape hatch), and this real `bun run build` below
    // is exactly what proves the injected entry actually builds.
    expect(result.created).not.toContain('src/main.ts')

    const projectDir = join(parentDir, 'my-app')

    // package.json sanity: no aspirational `^1.0.0` for @aihu/* + no `bun@1`.
    const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'))
    for (const [dep, range] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
      if (typeof dep === 'string' && dep.startsWith('@aihu/')) {
        expect(range, `${dep} should not be ^1.0.0 (no such version published)`).not.toBe('^1.0.0')
      }
    }
    if (pkg.packageManager) {
      expect(pkg.packageManager, 'packageManager must include a real version').toMatch(
        /^bun@\d+\.\d+\.\d+/,
      )
    }

    // Real install against npm.
    const installRes = spawnSync('bun', ['install'], {
      cwd: projectDir,
      stdio: 'pipe',
      encoding: 'utf8',
    })
    expect(installRes.status, `bun install failed:\n${installRes.stderr}`).toBe(0)

    // Typecheck.
    const tcRes = spawnSync('bun', ['run', 'typecheck'], {
      cwd: projectDir,
      stdio: 'pipe',
      encoding: 'utf8',
    })
    expect(tcRes.status, `typecheck failed:\n${tcRes.stderr}\n${tcRes.stdout}`).toBe(0)

    // Build.
    const buildRes = spawnSync('bun', ['run', 'build'], {
      cwd: projectDir,
      stdio: 'pipe',
      encoding: 'utf8',
    })
    expect(buildRes.status, `build failed:\n${buildRes.stderr}\n${buildRes.stdout}`).toBe(0)

    // Build output sanity: dist/ should exist with at least one .js.
    expect(existsSync(join(projectDir, 'dist'))).toBe(true)

    // ── The agent surface the config asked for actually shipped ─────────────
    //
    // Asserting on file CONTENT, not just presence. FEL-423's failure mode was
    // documents that existed, returned 200, and said nothing — an existsSync
    // check passes on every one of them.
    const dist = (p: string) => join(projectDir, 'dist', p)

    const llms = readFileSync(dist('llms.txt'), 'utf8')
    expect(llms, 'llms.txt must not be the SPA fallback').not.toContain('<!DOCTYPE')
    expect(llms).toContain('# my-app')

    // KNOWN GAP — the remaining half of FEL-423, deliberately NOT asserted.
    //
    // This file is ~60 bytes: a title and a summary, with no `## Components`
    // section, even though src/pages/index.aihu declares three `$action`
    // entries. Cause is in the compiler: `elide_agent` (codegen/emit.rs)
    // strips `registerAgentMetadata(...)` from CLIENT-target builds, so
    // nothing populates the registry the generator reads.
    //
    // There is deliberately NO `expect(llms).not.toContain('## Components')`.
    // Asserting the absence would certify the defect as correct and go green
    // forever — which is exactly how the plugin's own unit test ("omits the
    // Components section when the registry is empty") let this ship. When the
    // compiler emission lands, ADD the positive assertion.
    //
    // NOTE this harness installs PUBLISHED @aihu/* packages, so it builds with
    // the published compiler. It cannot see an unlanded compiler change — do
    // not use it to verify the fix when that work happens.

    const robots = readFileSync(dist('robots.txt'), 'utf8')
    expect(robots).toContain('User-agent:')

    // The MCP server card must NOT be emitted. The scaffolded config declares
    // no `endpoint` because a static client build has no process to serve one;
    // publishing a card would advertise a transport that answers nothing. The
    // previous scaffold set `endpoint` to the card's OWN url and shipped a
    // card listing zero tools (FEL-423).
    expect(
      existsSync(dist('.well-known/mcp/server-card.json')),
      'a static build must not publish an MCP server card',
    ).toBe(false)
    expect(existsSync(dist('.well-known/mcp.json'))).toBe(false)
  }, 180_000)
})
