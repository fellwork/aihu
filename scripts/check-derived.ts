#!/usr/bin/env bun
/**
 * check:derived — thesis §2: the agent surface is DERIVED, never hand-maintained.
 *
 * Thesis test of the property: "if a human has to remember to update something
 * when they add an `$action`, the property is violated. A comment reading
 * 'kept in sync with…' is a defect report."
 *
 * This check does NOT grep for that comment. The comment is the symptom; the
 * duplicated declaration is the defect, and the two do not correspond one to
 * one in either direction:
 *
 *   - The scaffold carries THREE comments (`cli/src/index.ts:206`, `:306`,
 *     `:318`) about ONE hand-written `skills` literal. A per-comment rule
 *     reports 3 where the scorecard says 1.
 *   - `agent-server/src/opaque-id.ts:4` says "Mirrors the compiler's
 *     `opaque_member_id`" and is NOT a finding — it is a cross-language
 *     algorithm parity note with no second TypeScript declaration. A naive
 *     comment-grep flags it and blows the count from 2 to 3.
 *   - `plugin-agent-readiness/src/types.ts:1` claims to mirror ITSELF (a
 *     copy-paste artifact). The comment is not parseable as a source of truth.
 *
 * So both rules are AST-based and key on structure:
 *
 *   D1 — the same exported type/interface NAME declared in ≥2 distinct
 *        agent-surface packages, with overlapping members. One duplication,
 *        one finding, regardless of how many comments describe it.
 *   D2 — a hand-authored agent-artifact literal (`skills:`/`tools:`/`actions:`
 *        arrays of object literals with literal ids) in scaffold output or an
 *        example's vite config, i.e. not the return of a call into the
 *        registry or manifest.
 *
 * NO suppression comments are supported. An in-source waiver would be exactly
 * the vacuous pattern this slice exists to eliminate.
 *
 * Wired into CI (plan-a.yml `check` job). Run manually:
 *   bun run check:derived
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Glob } from 'bun'
import ts from 'typescript'
import {
  type Finding,
  ROOT,
  agentSurfaceFiles,
  expectCount,
  expectedFrom,
  isExcluded,
  refuseVacuous,
  selfTest,
} from './lib/invariant.ts'

const NAME = 'check:derived'

/** Artifact keys whose hand-written array literals are the derivation target. */
const ARTIFACT_KEYS = new Set(['skills', 'tools', 'actions'])

// ─── Parsing ─────────────────────────────────────────────────────────────────

function parse(source: string, fileName: string): ts.SourceFile {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
}

/** The package a repo-relative path belongs to (`packages/<name>`), or ''. */
function packageOf(rel: string): string {
  const m = /^packages\/([^/]+)\//.exec(rel)
  return m ? m[1]! : ''
}

// ─── Rule D1: duplicated agent-surface declaration ───────────────────────────

interface DeclInfo {
  readonly file: string
  readonly pkg: string
  readonly line: number
  readonly members: ReadonlySet<string>
}

function collectDeclarations(rel: string, source: string): Map<string, DeclInfo> {
  const sf = parse(source, rel)
  const out = new Map<string, DeclInfo>()

  const isExported = (node: ts.Node): boolean =>
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)

  const memberNames = (members: ts.NodeArray<ts.TypeElement>): Set<string> => {
    const names = new Set<string>()
    for (const m of members) {
      if (m.name && ts.isIdentifier(m.name)) names.add(m.name.text)
      else if (m.name && ts.isStringLiteral(m.name)) names.add(m.name.text)
    }
    return names
  }

  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) && isExported(node)) {
      out.set(node.name.text, {
        file: rel,
        pkg: packageOf(rel),
        line: lineOf(sf, node),
        members: memberNames(node.members),
      })
    } else if (
      ts.isTypeAliasDeclaration(node) &&
      isExported(node) &&
      ts.isTypeLiteralNode(node.type)
    ) {
      out.set(node.name.text, {
        file: rel,
        pkg: packageOf(rel),
        line: lineOf(sf, node),
        members: memberNames(node.type.members),
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

/**
 * Overlap between two member sets, as |intersection| / |smaller|.
 *
 * Why not the spec's exact structural hash: the two `AgentReadinessConfig`
 * declarations have ALREADY DRIFTED — the plugin copy carries five fields the
 * server copy lacks (`siteUrl`, `a2aCard`, `mcpDiscovery`, `sitemapPages`,
 * `jsonLd`). An equality-on-hash rule finds ZERO findings here, i.e. it would
 * pass on day one, which the acceptance criteria treat as a defect in the
 * check. The drift IS the defect the property predicts, so the rule keys on
 * "same exported name, substantially overlapping members" instead. Recorded as
 * a deviation in the build manifest.
 */
function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  const smaller = a.size <= b.size ? a : b
  const larger = a.size <= b.size ? b : a
  if (smaller.size === 0) return 0
  let hits = 0
  for (const m of smaller) if (larger.has(m)) hits++
  return hits / smaller.size
}

const OVERLAP_THRESHOLD = 0.5

function ruleD1(files: ReadonlyArray<{ rel: string; source: string }>): Finding[] {
  const byName = new Map<string, DeclInfo[]>()
  for (const { rel, source } of files) {
    for (const [name, info] of collectDeclarations(rel, source)) {
      const list = byName.get(name) ?? []
      list.push(info)
      byName.set(name, list)
    }
  }

  const findings: Finding[] = []
  for (const [name, decls] of [...byName].sort(([a], [b]) => a.localeCompare(b))) {
    // Distinct packages only — two declarations inside one package are a
    // module-layout question, not a cross-boundary sync seam.
    const byPkg = new Map<string, DeclInfo>()
    for (const d of decls) if (!byPkg.has(d.pkg)) byPkg.set(d.pkg, d)
    if (byPkg.size < 2) continue

    const list = [...byPkg.values()]
    let duplicated = false
    for (let i = 0; i < list.length && !duplicated; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (overlap(list[i]!.members, list[j]!.members) >= OVERLAP_THRESHOLD) {
          duplicated = true
          break
        }
      }
    }
    if (!duplicated) continue

    const sites = list.map((d) => `${d.file}:${d.line}`).join(', ')
    findings.push({
      where: `${list[0]!.file}:${list[0]!.line}`,
      rule: 'D1',
      message:
        `\`${name}\` is declared in ${byPkg.size} agent-surface packages with overlapping ` +
        `members — a hand-maintained sync seam. Sites: ${sites}. ` +
        'Single-source it; the agent surface must be derived, not mirrored.',
    })
  }
  return findings
}

// ─── Rule D2: hand-authored agent artifact literal ───────────────────────────

/**
 * Find `skills:`/`tools:`/`actions:` array-of-object-literals in config
 * position. Object elements must carry a LITERAL `id` or `name` — a value
 * produced by a call into the registry or manifest is the derivation target,
 * not a hand-mirrored artifact.
 */
function findArtifactLiterals(sf: ts.SourceFile, rel: string, lineOffset: number): Finding[] {
  const findings: Finding[] = []

  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      ARTIFACT_KEYS.has(node.name.text) &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      const elements = node.initializer.elements
      const objects = elements.filter(ts.isObjectLiteralExpression)
      const literalIded = objects.filter((o) =>
        o.properties.some(
          (p) =>
            ts.isPropertyAssignment(p) &&
            (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
            (p.name.text === 'id' || p.name.text === 'name') &&
            (ts.isStringLiteral(p.initializer) ||
              ts.isNoSubstitutionTemplateLiteral(p.initializer) ||
              ts.isTemplateExpression(p.initializer)),
        ),
      )
      if (objects.length > 0 && objects.length === elements.length && literalIded.length > 0) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 + lineOffset
        findings.push({
          where: `${rel}:${line}`,
          rule: 'D2',
          message:
            `hand-authored \`${node.name.text}\` array of ${objects.length} literal entries — ` +
            'an agent artifact maintained beside the source it should be derived from. ' +
            'Generate it from the compiler-emitted registry/manifest.',
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return findings
}

/**
 * Scaffold templates emit code as TEMPLATE STRINGS, so the `skills:` literal
 * at `cli/src/index.ts:207` is text inside a `TemplateExpression`, not an AST
 * node — walking the file directly finds nothing. We therefore extract each
 * template's text, replace `${…}` substitutions with a placeholder identifier,
 * and parse the RESULT as TypeScript. The scaffold emits code; the emitted
 * code is what gets checked.
 */
function scanEmittedTemplates(rel: string, source: string): Finding[] {
  const sf = parse(source, rel)
  const findings: Finding[] = []

  const visit = (node: ts.Node): void => {
    if (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      let text: string
      if (ts.isNoSubstitutionTemplateLiteral(node)) {
        text = node.text
      } else {
        // `${x}` → a placeholder identifier, so the emitted code still parses
        // and string positions like `id: '${tag}.increment'` stay literals.
        text = node.head.text
        for (const span of node.templateSpans) text += `__SUBST__${span.literal.text}`
      }
      if (![...ARTIFACT_KEYS].some((k) => text.includes(`${k}:`))) return
      const startLine = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
      // A template body is usually a fragment (e.g. `export default {…}`);
      // wrapping in a parenthesized expression is unnecessary because the
      // scaffold emits whole modules. Parse as-is and tolerate parse noise —
      // ts.createSourceFile never throws, it produces a best-effort tree.
      const inner = parse(text, `${rel}<template>`)
      for (const f of findArtifactLiterals(inner, rel, startLine - 1)) {
        findings.push({
          ...f,
          message: `${f.message} (inside a scaffold template emitted by this file)`,
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return findings
}

function ruleD2(files: ReadonlyArray<{ rel: string; source: string }>): Finding[] {
  const findings: Finding[] = []
  for (const { rel, source } of files) {
    const sf = parse(source, rel)
    findings.push(...findArtifactLiterals(sf, rel, 0))
    // Scaffold sources additionally emit code as strings.
    if (rel.startsWith('packages/cli/src/')) findings.push(...scanEmittedTemplates(rel, source))
  }
  return findings
}

// ─── Scan ────────────────────────────────────────────────────────────────────

function readAll(rels: readonly string[], base = ROOT): Array<{ rel: string; source: string }> {
  const out: Array<{ rel: string; source: string }> = []
  for (const rel of rels) {
    const abs = join(base, rel)
    if (existsSync(abs)) out.push({ rel, source: readFileSync(abs, 'utf8') })
  }
  return out
}

function scan(files: ReadonlyArray<{ rel: string; source: string }>): Finding[] {
  return [...ruleD1(files), ...ruleD2(files)]
}

// ─── Bidirectional self-test ─────────────────────────────────────────────────

const FIXTURES = join(import.meta.dir, 'fixtures/check-derived')

function fixtureFiles(dir: string): Array<{ rel: string; source: string }> {
  const base = join(FIXTURES, dir)
  const rels = [...new Glob('**/*.ts').scanSync(base)].map((p) => p.replaceAll('\\', '/')).sort()
  return readAll(rels, base)
}

function runSelfTest(): void {
  const flag = fixtureFiles('should-flag')
  const noflag = fixtureFiles('should-not-flag')
  refuseVacuous(flag, NAME, 'should-flag fixture files')
  refuseVacuous(noflag, NAME, 'should-not-flag fixture files')
  selfTest(NAME, [
    // one duplicated interface across two package dirs + one hand-written
    // skills literal in a vite config = 2.
    { label: 'should-flag', actual: scan(flag).length, expected: 2 },
    // the opaque-id parity-note shape and a primitives-style DOM "kept in
    // sync" comment. Neither is a duplicated declaration or an artifact
    // literal; a comment-grep would flag both.
    { label: 'should-not-flag', actual: scan(noflag).length, expected: 0 },
  ])
}

// ─── Main ────────────────────────────────────────────────────────────────────

runSelfTest()

const surface = await agentSurfaceFiles()
const exampleConfigs = [...new Glob('examples/*/vite.config.*').scanSync(ROOT)]
  .map((p) => p.replaceAll('\\', '/'))
  .filter((p) => !isExcluded(p) && /\.(ts|mts|cts|js|mjs)$/.test(p))

const targets = [...surface, ...exampleConfigs].sort()
refuseVacuous(targets, NAME, 'agent-surface source files')

const files = readAll(targets)
refuseVacuous(files, NAME, 'readable agent-surface source files')

console.log(`${NAME} — scanning ${files.length} agent-surface file(s).`)
expectCount(scan(files), expectedFrom(process.argv, 'derived'), NAME)
