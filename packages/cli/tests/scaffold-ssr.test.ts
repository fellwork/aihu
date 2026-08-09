import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { aihuDep } from '../src/dep-versions.ts'
import { scaffoldApp } from '../src/index.ts'
import { BUILTIN_TEMPLATES, selectTemplate } from '../src/templates-registry.ts'

/**
 * `--template ssr` — the only scaffold that emits `output: 'ssr'`.
 *
 * WHAT THESE ASSERT AND WHAT THEY CANNOT. Everything here is an EMITTER check:
 * it proves the right bytes were written. It cannot prove the emitted project
 * installs, builds, or produces a Worker that loads — for that the artifact has
 * to be built and driven, which is
 * `packages/cli/tests/scaffold-matrix-e2e.ts --template ssr` (wired into
 * plan-a.yml's `scaffold-consistency` job on every PR, against this branch's
 * own packages via `--local-pkg`). These two layers are complements, not
 * substitutes, and the fast one must not be mistaken for the slow one.
 *
 * The three config options below are asserted INDIVIDUALLY rather than as a
 * substring of the whole file because they fail independently and for different
 * reasons: drop `output` and you get a client-only build with no `_worker.js`;
 * drop `css.shadowMode` and every nested component renders empty; drop the
 * adapter and the SSR bundle is a node module, not a Worker.
 */

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'aihu-ssr-tpl-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

const read = (rel: string): string => readFileSync(join(tmpDir, 'demo', rel), 'utf8')

describe('scaffoldApp · template ssr', () => {
  it('is a selectable built-in, not an unknown template name', () => {
    expect(BUILTIN_TEMPLATES).toContain('ssr')
    expect(selectTemplate('ssr')).toEqual({ kind: 'builtin', id: 'ssr' })
  })

  it("emits all three options output:'ssr' requires, together", () => {
    scaffoldApp('demo', tmpDir, { template: 'ssr' })
    const vite = read('vite.config.ts')

    expect(vite).toContain("output: 'ssr'")
    // Not a style preference: a shadow leaf exports no __aihu_shadow__, so
    // every CHILD component renders empty server-side.
    expect(vite).toContain("css: { shadowMode: 'light' }")
    // What makes the SSR bundle a Worker rather than a node SSR bundle.
    //
    // A BACKTICK literal, not a quoted one, and that is load-bearing rather
    // than stylistic: `check:moon-graph` scans ordinary '…'/"…" strings as CODE
    // on purpose (that is where real specifiers live) and blanks template
    // literals as TEXT. Written as `"… from '@aihu/adapter-cloudflare'"` this
    // assertion reads as an import BY @aihu/cli and the gate demands a
    // `dependsOn: adapter-cloudflare` build edge for a package the CLI does not
    // depend on — a false edge added to satisfy a scanner. Measured, not
    // predicted: that is exactly what it reported.
    expect(vite).toContain(`import { cloudflare } from '@aihu/adapter-cloudflare'`)
    expect(vite).toContain("adapter: cloudflare({ name: 'demo' })")
  })

  it('declares the adapter it configures', () => {
    scaffoldApp('demo', tmpDir, { template: 'ssr' })
    const pkg = JSON.parse(read('package.json')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
      scripts: Record<string, string>
    }

    // The vite.config.ts above imports it at config-load time, so an
    // undeclared adapter is not a runtime surprise — it is a build that cannot
    // start. This is the one dependency `minimal` does not have.
    expect(pkg.dependencies['@aihu/adapter-cloudflare']).toBe(aihuDep('@aihu/adapter-cloudflare'))
  })

  it('ships no `preview` script, deliberately', () => {
    scaffoldApp('demo', tmpDir, { template: 'ssr' })
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> }

    // `vite preview` serves the CLIENT outDir as static files. Under
    // output:'ssr' the thing that has to answer is the Worker, so a green
    // `vite preview` is a 200 on a page the Worker never rendered — the wrong
    // artifact, reported as success. `wrangler dev` is the real answer and the
    // README says so.
    expect(pkg.scripts.preview).toBeUndefined()
    expect(pkg.scripts.build).toBe('vite build')
    expect(pkg.scripts.dev).toBe('vite')
    expect(read('README.md')).toContain('npx wrangler dev')
  })

  it('pins no `"latest"` anywhere in the emitted manifest', () => {
    scaffoldApp('demo', tmpDir, { template: 'ssr' })
    const pkg = JSON.parse(read('package.json')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    const ranges = [...Object.entries(pkg.dependencies), ...Object.entries(pkg.devDependencies)]
    expect(ranges.filter(([, range]) => range === 'latest')).toEqual([])
    // And every `@aihu/*` range is the GENERATED one, not a hand-typed caret
    // that happens to look right today.
    for (const [name, range] of ranges) {
      if (name.startsWith('@aihu')) expect(range, name).toBe(aihuDep(name))
    }
  })

  it('carries the widened vite range, on both majors', () => {
    scaffoldApp('demo', tmpDir, { template: 'ssr' })
    const pkg = JSON.parse(read('package.json')) as { devDependencies: Record<string, string> }
    expect(pkg.devDependencies.vite).toBe('^6 || ^8')
  })

  it('emits the SSR-specific agent guide, not the static-template one', () => {
    scaffoldApp('demo', tmpDir, { template: 'ssr' })
    const agents = read('AGENTS.md')
    // The static templates' AGENTS.md advertises `bun run preview`; this one
    // must not, or a coding agent will run the wrong artifact and report it
    // working. Same class of mistake the missing script above prevents.
    expect(agents).not.toContain('bun run preview')
    expect(agents).toContain('npx wrangler deploy')
    expect(agents).toContain('dist-server/_worker.js')
  })

  it('adds @aihu/css-engine only when --css engine is chosen', () => {
    scaffoldApp('plain', tmpDir, { template: 'ssr' })
    const plain = JSON.parse(readFileSync(join(tmpDir, 'plain', 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }
    expect(plain.dependencies['@aihu/css-engine']).toBeUndefined()

    scaffoldApp('utility', tmpDir, { template: 'ssr', css: 'engine' })
    const utility = JSON.parse(readFileSync(join(tmpDir, 'utility', 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }
    // The utility-class page would compile against nothing without it.
    expect(utility.dependencies['@aihu/css-engine']).toBe(aihuDep('@aihu/css-engine'))
  })
})
