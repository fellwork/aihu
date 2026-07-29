/**
 * Every `types` entry a template's tsconfig names must be INSTALLABLE from that
 * template's own manifests.
 *
 * `compilerOptions.types` is a hard requirement, not a hint: tsc resolves each
 * entry as a type library and fails the whole program when one is missing —
 * `error TS2688: Cannot find type definition file for '<x>'` — with no clue
 * that the cause is an undeclared dependency.
 *
 * Found by running the acceptance rather than asserting it. In scaffold-matrix
 * run 30415446060 the cf-team template typechecked on none of the four package
 * managers because its root tsconfig named `@cloudflare/workers-types` and no
 * manifest in the tree asked for it. That failure was hidden behind an earlier
 * one (git exit 128 out of moon's `base="main"`) until the branch pin landed —
 * a defect can only be seen once the one in front of it is gone.
 *
 * This asserts the CLASS, not the instance: it walks whatever tsconfigs the
 * templates actually ship, so the next template to name a type package is
 * covered without editing this file.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const TEMPLATES_ROOT = join(import.meta.dirname, '../../templates')

/** tsc ships these itself; they are never a package.json entry. */
const BUILTIN_TYPE_LIBS = new Set<string>([])

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

/** `types: ["node"]` means the package `@types/node`. */
function packagesFor(typeEntry: string): string[] {
  return typeEntry.startsWith('@') && typeEntry.includes('/')
    ? [typeEntry]
    : [`@types/${typeEntry}`, typeEntry]
}

interface TypeRequirement {
  readonly template: string
  readonly tsconfig: string
  readonly typeEntry: string
}

function collectRequirements(): TypeRequirement[] {
  const reqs: TypeRequirement[] = []
  for (const template of readdirSync(TEMPLATES_ROOT)) {
    const root = join(TEMPLATES_ROOT, template)
    if (!statSync(root).isDirectory()) continue
    const templateDir = join(root, 'template')
    let files: string[]
    try {
      files = walk(templateDir)
    } catch {
      continue // not a scaffold-emitting template package
    }
    for (const f of files.filter((p) => /tsconfig[^/]*\.json$/.test(p))) {
      // Emitted tsconfigs are JSON with comments in principle; these are not,
      // and a parse failure here is itself worth failing on.
      const cfg = JSON.parse(readFileSync(f, 'utf8')) as {
        compilerOptions?: { types?: string[] }
      }
      for (const t of cfg.compilerOptions?.types ?? []) {
        if (BUILTIN_TYPE_LIBS.has(t)) continue
        reqs.push({ template, tsconfig: f.slice(templateDir.length + 1), typeEntry: t })
      }
    }
  }
  return reqs
}

/** Every dependency name declared anywhere in one template's manifests. */
function declaredIn(template: string): Set<string> {
  const templateDir = join(TEMPLATES_ROOT, template, 'template')
  const names = new Set<string>()
  for (const f of walk(templateDir).filter((p) => /package\.json(\.tmpl)?$/.test(p))) {
    // `.tmpl` manifests carry placeholders like `__APP_CONDITIONAL_DEPS__`
    // which are not valid JSON, so read the KEYS textually rather than parsing.
    for (const m of readFileSync(f, 'utf8').matchAll(/^\s*"([^"]+)":\s*"[^"]*"/gm)) {
      const key = m[1]
      if (key !== undefined) names.add(key)
    }
  }
  return names
}

describe('template tsconfig `types` are declared dependencies', () => {
  const reqs = collectRequirements()

  it('finds type requirements to check at all', () => {
    // Without this the suite passes vacuously the moment the walk breaks —
    // the same absent-value shape as a matrix cell that SKIPs green.
    expect(reqs.length).toBeGreaterThan(0)
  })

  for (const r of reqs) {
    it(`${r.template}: ${r.tsconfig} names "${r.typeEntry}", which must be installable`, () => {
      const declared = declaredIn(r.template)
      const candidates = packagesFor(r.typeEntry)
      expect(
        candidates.some((c) => declared.has(c)),
        `tsconfig requires the type library "${r.typeEntry}" but no manifest in the ` +
          `${r.template} template declares ${candidates.join(' or ')}. tsc fails the ` +
          `whole program with TS2688 and never says the cause is a missing dependency.`,
      ).toBe(true)
    })
  }
})
