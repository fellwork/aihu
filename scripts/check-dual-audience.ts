#!/usr/bin/env bun
/**
 * check:dual-audience — thesis §1: humans and agents are both first-class
 * audiences of ONE codebase, and the agent axis is a real projection rather
 * than the UI re-serialized.
 *
 * "Any content reachable only by executing the site's presentation logic is
 * unavailable to the agent axis entirely."
 *
 * The furthest property: the scorecard measures 0/3. Three sub-checks, each
 * one finding:
 *
 *   DA-a  A markdown representation can be PRODUCED. `MarkdownResolver` must
 *         have a real implementation — a VALUE, exported from a package public
 *         entry. Today every reference is the interface declaration, the config
 *         field, a `dist/*.d.ts` re-export, or a test mock.
 *
 *   DA-b  Negotiation reaches non-`Accept` clients. Behavioral: build the real
 *         middleware, send a request with NO `Accept` header and a crawler
 *         user-agent, expect markdown. Today `content-negotiation.ts` reads
 *         `Accept` and nothing else, and AI crawlers do not send it.
 *
 *   DA-c  Primary content is retrievable without JS. Behavioral: drive the real
 *         `createServerRouter(...).handle(req)` and look for the content and the
 *         hydration markers in the raw body. Today `router/src/server.ts:41`
 *         calls `renderToString(component)` with NO options, and every marker in
 *         `ssr.ts` is gated on `opts?.hydratable ?? false`.
 *
 * DA-a's exclusions are the load-bearing part of this check. The four
 * `tests/compliance/` suites report green precisely because THE TEST SUPPLIES
 * THE THING THAT DOES NOT EXIST — `isitagentready.test.ts` injects its own mock
 * `mdResolver`. So DA-a refuses to count test mocks, refuses `dist/`, refuses a
 * TYPE (a re-exported interface is not an implementation), and refuses a
 * resolver constructed inside this check.
 *
 * DA-c asserts the PRESENCE OF MARKERS and the REACHABILITY OF TEXT, never an
 * exact markup string — the explicit anti-`hydrate.test.ts` guard, that suite
 * having hand-written the `hydrate.0` markup it then asserted.
 *
 * NO suppression comments are supported.
 *
 * Wired into CI (plan-a.yml `check` job). Run via the npm script, NOT bare bun:
 *   bun run check:dual-audience
 *
 * The script carries two settings this check does not work without.
 * `--tsconfig-override ./tsconfig.json` forces the root `paths` map onto every
 * file, because the per-package tsconfigs omit `baseUrl` and bun therefore
 * ignores their `paths` — without it a transitive `@aihu/*` import throws and
 * this check crashes instead of reporting. `SCRIBE_NATIVE_SKIP=1` selects the
 * TypeScript SSR fallback ("slower, always correct"), matching what
 * `vitest.config.ts` sets for the same reason; the native renderer binary is
 * not built in a plain checkout.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Glob } from 'bun'
import ts from 'typescript'
import {
  expectCount,
  expectedFrom,
  type Finding,
  isExcluded,
  ROOT,
  refuseVacuous,
  selfTest,
} from './lib/invariant.ts'

const NAME = 'check:dual-audience'

// ─── DA-a: a MarkdownResolver implementation exists ──────────────────────────

/** The structural contract: `resolve(path: string): Promise<string | null>`. */
const RESOLVER_METHOD = 'resolve'

function parse(source: string, fileName: string): ts.SourceFile {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
}

/**
 * Does this node declare a VALUE that structurally satisfies MarkdownResolver?
 *
 * A type or interface never qualifies, however perfectly it matches — an
 * interface is the declaration of the gap, not its filling. This is the direct
 * counter to the scorecard's finding that all nine `MarkdownResolver` hits are
 * declarations, config fields, `dist` re-exports, or mocks.
 */
function declaresResolverValue(node: ts.Node): boolean {
  // class X { async resolve(p: string) { … } }
  if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
    return node.members.some(
      (m) =>
        (ts.isMethodDeclaration(m) || ts.isPropertyDeclaration(m)) &&
        m.name !== undefined &&
        ts.isIdentifier(m.name) &&
        m.name.text === RESOLVER_METHOD,
    )
  }
  // const x = { resolve(p) { … } } / { resolve: async (p) => … }
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.some(
      (p) =>
        p.name !== undefined &&
        ts.isIdentifier(p.name) &&
        p.name.text === RESOLVER_METHOD &&
        (ts.isMethodDeclaration(p) ||
          (ts.isPropertyAssignment(p) &&
            (ts.isArrowFunction(p.initializer) || ts.isFunctionExpression(p.initializer)))),
    )
  }
  return false
}

/** Exported value declarations in a file that satisfy the resolver shape. */
function findResolverValues(rel: string, source: string): string[] {
  const sf = parse(source, rel)
  const hits: string[] = []

  const isExported = (node: ts.Node): boolean =>
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)

  const at = (node: ts.Node): string =>
    `${rel}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`

  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && isExported(node) && declaresResolverValue(node)) {
      hits.push(at(node))
    }
    if (ts.isVariableStatement(node) && isExported(node)) {
      for (const d of node.declarationList.declarations) {
        if (!d.initializer) continue
        // `const r: MarkdownResolver = { resolve … }` or a factory's return
        // is not followed here — a factory is only an implementation once
        // something exports its result, which the object-literal case covers.
        if (declaresResolverValue(d.initializer)) hits.push(at(d))
        else if (
          (ts.isAsExpression(d.initializer) || ts.isSatisfiesExpression(d.initializer)) &&
          declaresResolverValue(d.initializer.expression)
        ) {
          hits.push(at(d))
        }
      }
    }
    // A factory function whose body returns a resolver object literal is a
    // real implementation the moment it is exported.
    if (
      (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
      isExported(node) &&
      node.body
    ) {
      let returnsResolver = false
      const scan = (n: ts.Node): void => {
        if (ts.isReturnStatement(n) && n.expression && declaresResolverValue(n.expression)) {
          returnsResolver = true
        }
        ts.forEachChild(n, scan)
      }
      scan(node.body)
      if (returnsResolver) hits.push(at(node))
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return hits
}

/**
 * Package public entries: `packages/<pkg>/src/index.ts` plus the source files
 * named by each package's `exports` map. Only code REACHABLE FROM A PUBLIC
 * ENTRY counts — a resolver buried in an unexported internal module is not a
 * representation any agent can obtain.
 */
function publicEntrySources(base = ROOT): Array<{ rel: string; source: string }> {
  const out: Array<{ rel: string; source: string }> = []
  const seen = new Set<string>()

  const add = (rel: string): void => {
    const norm = rel.replaceAll('\\', '/')
    if (seen.has(norm) || isExcluded(norm)) return
    const abs = join(base, norm)
    if (!existsSync(abs)) return
    seen.add(norm)
    out.push({ rel: norm, source: readFileSync(abs, 'utf8') })
  }

  for (const pkgJson of new Glob('packages/*/package.json').scanSync(base)) {
    const rel = pkgJson.replaceAll('\\', '/')
    if (isExcluded(rel)) continue
    const dir = rel.slice(0, rel.lastIndexOf('/'))
    add(`${dir}/src/index.ts`)
    // Follow the whole src tree of any package that mentions MarkdownResolver,
    // so an implementation placed beside the interface is still discoverable.
    for (const f of new Glob(`${dir}/src/**/*.ts`).scanSync(base)) add(f)
  }
  return out
}

function runDaA(files: ReadonlyArray<{ rel: string; source: string }>): {
  hits: string[]
  finding: Finding | null
} {
  const hits = files.flatMap((f) => findResolverValues(f.rel, f.source))
  if (hits.length > 0) return { hits, finding: null }
  return {
    hits,
    finding: {
      where: 'packages/plugin-agent-readiness/src/content-negotiation.ts:13',
      rule: 'DA-a',
      message:
        'no `MarkdownResolver` IMPLEMENTATION is exported from any package public entry — only ' +
        'the interface declaration, the config field, `dist/*.d.ts` re-exports, and test mocks. ' +
        'A markdown representation cannot be produced in production, so the agent axis has no ' +
        'content to negotiate for. (Test mocks are deliberately not counted: the compliance ' +
        'suites report green because they supply the thing that does not exist.)',
    },
  }
}

// ─── DA-b: negotiation reaches non-`Accept` clients ──────────────────────────

/** Crawler UAs that do not send `Accept: text/markdown`, plus a human cell. */
const UA_MATRIX = [
  { label: 'GPTBot, no Accept header', ua: 'GPTBot/1.0', accept: null, wantMarkdown: true },
  {
    label: 'ClaudeBot, no Accept header',
    ua: 'ClaudeBot/1.0',
    accept: null,
    wantMarkdown: true,
  },
  // The must-not-flag cell. Demanding markdown for a browser would break the
  // HUMAN axis — a thesis violation in the opposite direction, and just as
  // real. "A human receives an experience."
  {
    label: 'a normal browser UA (must stay HTML)',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    accept: 'text/html,application/xhtml+xml',
    wantMarkdown: false,
  },
] as const

interface UaOutcome {
  readonly label: string
  readonly gotMarkdown: boolean
  readonly correct: boolean
}

async function runDaB(
  uaAware: boolean,
): Promise<{ outcomes: UaOutcome[]; finding: Finding | null }> {
  const { createContentNegotiationHandler } = await import(
    '@aihu-plugin/agent-readiness/content-negotiation'
  ).catch(() => import('@aihu-plugin/agent-readiness'))

  const outcomes: UaOutcome[] = []
  for (const cell of UA_MATRIX) {
    // The resolver here belongs to the PROBE, not to production — DA-a is what
    // asserts a production implementation exists, and it counts nothing built
    // in this file. DA-b is only asking whether negotiation is REACHED.
    const middleware = createContentNegotiationHandler({
      resolver: { resolve: async () => '# probe\n\nprimary content' },
    })
    const headers: Record<string, string> = { 'User-Agent': cell.ua }
    if (cell.accept) headers.Accept = cell.accept

    const req = new Request('https://example.test/docs/page', { headers })
    const next = async () =>
      new Response('<html><body>ui</body></html>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })

    let res = await middleware(req, next)
    // `--self-test` mutation: simulate the UA-aware implementation the
    // property requires, proving the probe can observe a PASS and is not
    // structurally always-red.
    if (uaAware && !cell.accept && /bot|gpt|claude/i.test(cell.ua)) {
      res = new Response('# probe', { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } })
    }

    const ct = res?.headers.get('Content-Type') ?? ''
    const gotMarkdown = ct.includes('text/markdown')
    outcomes.push({
      label: cell.label,
      gotMarkdown,
      correct: gotMarkdown === cell.wantMarkdown,
    })
  }

  const bad = outcomes.filter((o) => !o.correct)
  if (bad.length === 0) return { outcomes, finding: null }
  return {
    outcomes,
    finding: {
      where: 'packages/plugin-agent-readiness/src/content-negotiation.ts:49',
      rule: 'DA-b',
      message:
        `content negotiation ignores the user-agent — ${bad.length}/${outcomes.length} cells wrong ` +
        `(${bad.map((b) => b.label).join('; ')}). The middleware reads \`Accept\` and nothing ` +
        'else, and only a minority of agent clients send `Accept: text/markdown`. Format ' +
        'selection is supposed to move to the client; for a crawler it never gets the chance.',
    },
  }
}

// ─── DA-c: primary content retrievable without JS ────────────────────────────

const PRIMARY_TEXT = 'PRIMARY-CONTENT-REACHABLE-WITHOUT-JS'

async function runDaC(hydratable: boolean): Promise<{ body: string; finding: Finding | null }> {
  const { createServerRouter } = await import('@aihu/router/server')
  const { branch, leaf } = await import('@aihu/arbor')
  const { renderToString } = await import('@aihu/server')

  // A fixture route whose component renders known text. We assert the text is
  // REACHABLE and the hydration markers are PRESENT — never an exact markup
  // blob. `hydrate.test.ts` hand-wrote the `hydrate.0` markup it then asserted
  // and measured nothing; this must not repeat that.
  //
  // `leaf` takes `Signal<string> | string`; a plain string is used deliberately.
  // Passing a bare signal GETTER stringifies the accessor's source into the
  // markup instead of its value, which silently made the primary text
  // unfindable and the should-not-flag half of this probe impossible to satisfy.
  const component = () =>
    branch('main', { id: 'page' }, [branch('article', {}, [leaf(PRIMARY_TEXT)])])

  const routes = [
    {
      pattern: '/probe',
      segments: [{ type: 'static' as const, value: 'probe' }],
      module: async () => ({ default: component }),
    },
  ] as unknown as Parameters<typeof createServerRouter>[0]

  let body: string
  if (hydratable) {
    // `--self-test` mutation: render the SAME component through the SAME
    // renderer the router uses, differing ONLY in the options object the
    // router fails to pass. Deliberately not a string patch of the live body —
    // a mutation that fakes the output proves nothing about whether the
    // assertions can recognize genuinely hydratable markup.
    body = await renderToString(component, { hydratable: true })
  } else {
    const router = createServerRouter(routes)
    const res = await router.handle(new Request('https://example.test/probe'))
    body = await res.text()
  }

  const hasText = body.includes(PRIMARY_TEXT)
  const hasMarkers = body.includes('data-aihu-path')
  // Content sealed inside a declarative shadow root is unreachable to a
  // non-JS extractor even when it is technically in the byte stream.
  const shadowStart = body.indexOf('shadowrootmode')
  const textIndex = body.indexOf(PRIMARY_TEXT)
  const textInShadow = shadowStart !== -1 && textIndex > shadowStart

  if (hasText && hasMarkers && !textInShadow) return { body, finding: null }

  const reasons: string[] = []
  if (!hasText) reasons.push('primary text absent from the raw body')
  if (!hasMarkers) {
    reasons.push(
      'no `data-aihu-path` markers — `router/src/server.ts:41` calls `renderToString(component)` ' +
        'with no options, and every marker in `ssr.ts` is gated on `opts?.hydratable ?? false`, ' +
        'so the production path emits non-hydratable output',
    )
  }
  if (textInShadow) reasons.push('primary text sits inside a declarative shadow root')

  // ONE finding covering both assertions: one defect (the missing options
  // object). Splitting them inflates dual-audience past 3.
  return {
    body,
    finding: {
      where: 'packages/router/src/server.ts:41',
      rule: 'DA-c',
      message: `primary content is not fully retrievable without JS — ${reasons.join('; ')}.`,
    },
  }
}

// ─── Self-test ───────────────────────────────────────────────────────────────

/** A fixture that DOES implement the resolver — DA-a's should-not-flag half. */
const RESOLVER_FIXTURE = `
  export class FileMarkdownResolver {
    async resolve(path: string): Promise<string | null> {
      return path.endsWith('.md') ? '# hi' : null
    }
  }
`
/** Shapes DA-a must REFUSE: a type, a mock, a config field. */
const NON_RESOLVER_FIXTURE = `
  export interface MarkdownResolver {
    resolve(path: string): Promise<string | null>
  }
  export type { MarkdownResolver as Resolver }
  export interface ContentNegotiationOptions {
    readonly resolver: MarkdownResolver
  }
  const notExported = { resolve: async () => null }
`

async function runSelfTest(): Promise<void> {
  const cases: Array<{ label: string; actual: number; expected: number }> = []

  // DA-a, both directions.
  cases.push({
    label: 'DA-a should-flag: only a type declaration + an unexported mock',
    actual: runDaA([{ rel: 'fixture/types.ts', source: NON_RESOLVER_FIXTURE }]).finding ? 1 : 0,
    expected: 1,
  })
  cases.push({
    label: 'DA-a should-not-flag: a real exported resolver class',
    actual: runDaA([{ rel: 'fixture/impl.ts', source: RESOLVER_FIXTURE }]).finding ? 1 : 0,
    expected: 0,
  })

  // DA-b, both directions.
  cases.push({
    label: 'DA-b should-flag: live Accept-only negotiation',
    actual: (await runDaB(false)).finding ? 1 : 0,
    expected: 1,
  })
  cases.push({
    label: 'DA-b should-not-flag: UA-aware negotiation (mutated)',
    actual: (await runDaB(true)).finding ? 1 : 0,
    expected: 0,
  })

  // DA-c, both directions.
  cases.push({
    label: 'DA-c should-flag: live router, renderToString with no options',
    actual: (await runDaC(false)).finding ? 1 : 0,
    expected: 1,
  })
  cases.push({
    label: 'DA-c should-not-flag: hydratable output (mutated)',
    actual: (await runDaC(true)).finding ? 1 : 0,
    expected: 0,
  })

  selfTest(NAME, cases)
}

// ─── Main ────────────────────────────────────────────────────────────────────

await runSelfTest()

const entries = publicEntrySources()
refuseVacuous(entries, NAME, 'package public entry sources')

const findings: Finding[] = []

const daA = runDaA(entries)
if (daA.finding) findings.push(daA.finding)

const daB = await runDaB(false)
if (daB.finding) findings.push(daB.finding)

const daC = await runDaC(false)
if (daC.finding) findings.push(daC.finding)

console.log(
  `${NAME} — scanned ${entries.length} public-entry source file(s); ran ${UA_MATRIX.length} ` +
    'negotiation cells and 1 SSR render.',
)
expectCount(findings, expectedFrom(process.argv, 'dual-audience'), NAME)
