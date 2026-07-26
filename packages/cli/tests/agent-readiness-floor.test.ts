/**
 * FEL-423 — the floor assertion: a served readiness surface must advertise a
 * NON-EMPTY capability set.
 *
 * The defect this exists to catch is not "the paths 404". It is the opposite:
 * every path answers 200 with well-formed content, and the content describes
 * zero capabilities. A readiness grader — or an agent — cannot distinguish
 * "this app genuinely exposes no tools" from "this app's tooling was never
 * wired in". Both are HTTP 200 and both parse.
 *
 * WHAT MAKES THIS DIFFERENT FROM THE PLUGIN'S OWN UNIT TEST.
 * `packages/plugin-agent-readiness/tests/vite-plugin.test.ts` already asserts
 * `## Components` appears when the registry is pre-seeded. That test passed
 * throughout the entire lifetime of FEL-423 — it seeds the registry by hand and
 * therefore cannot observe a template that never populates one. This file
 * exercises the ACTUAL GENERATED `readiness.ts` that `full` and `agent`
 * scaffold, through its real `handleReadiness()` entry point, against the real
 * `@aihu/agent` registry.
 *
 * ORDERING IS LOAD-BEARING, AND DELIBERATE.
 * The registry is a module-level Map (`packages/agent/src/registry.ts:120`)
 * with no publicly exported reset — `__resetRegistryForTesting` exists at :166
 * but is NOT re-exported from the package index, and importing it by relative
 * path would bind a SECOND module instance with its own Map, which the plugin
 * would not see. So the empty-registry phase runs FIRST, by file order, and the
 * populated phase registers into the same instance the plugin resolves.
 * `registryIsShared` below proves that assumption rather than assuming it.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getAllAgentMetadata, registerAgentMetadata } from '@aihu/agent'
import { afterAll, describe, expect, it } from 'vitest'
import { agentReadinessTs } from '../src/templates-agent.js'
import { fullReadinessTs } from '../src/templates-full.js'

interface ReadinessModule {
  READINESS_PATHS: readonly string[]
  handleReadiness(req: Request): Promise<Response | undefined>
}

const ORIGIN = 'http://localhost:5108'

/**
 * The temp dir lives INSIDE packages/cli/tests so Node's resolution walks up to
 * the workspace root `node_modules` and finds `@aihu-plugin/agent-readiness`
 * and `@aihu/agent`. A dir under `os.tmpdir()` would resolve neither, and the
 * generated module imports both by bare specifier.
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const tmpDirs: string[] = []

async function loadGenerated(source: string, label: string): Promise<ReadinessModule> {
  const dir = mkdtempSync(join(HERE, `.tmp-readiness-${label}-`))
  tmpDirs.push(dir)
  const file = join(dir, 'readiness.ts')
  writeFileSync(file, source)
  return (await import(pathToFileURL(file).href)) as ReadinessModule
}

afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true })
})

async function fetchPath(mod: ReadinessModule, path: string): Promise<Response> {
  const res = await mod.handleReadiness(new Request(`${ORIGIN}${path}`))
  expect(res, `${path} must be served by handleReadiness, not fall through`).toBeDefined()
  return res as Response
}

/** Tools advertised by the MCP server card — the number that must not be zero. */
function toolCount(card: unknown): number {
  const tools = (card as { tools?: unknown }).tools
  return Array.isArray(tools) ? tools.length : 0
}

// ── Phase 1 — EMPTY registry. This is the negative control. ─────────────────
//
// These assertions describe the DEFECT, not the desired state. They exist so
// that the Phase 2 floor assertion is known to be capable of failing: if the
// documents looked identical either way, a green Phase 2 would prove nothing.

describe('FEL-423 phase 1 — served surface with an EMPTY registry (the defect)', () => {
  it('serves 200 on every readiness path while advertising ZERO capabilities', async () => {
    expect(
      getAllAgentMetadata(),
      'phase 1 must run before anything registers — see the ordering note above',
    ).toHaveLength(0)

    const mod = await loadGenerated(fullReadinessTs('floor-probe'), 'full-empty')

    const llms = await (await fetchPath(mod, '/llms.txt')).text()
    const card = await (await fetchPath(mod, '/.well-known/mcp/server-card.json')).json()

    // Well-formed and completely uninformative. This is the whole issue.
    expect(llms, 'the document is still valid — that is what makes it dangerous').toContain(
      '# floor-probe',
    )
    expect(llms, 'no components can be listed from an empty registry').not.toContain(
      '## Components',
    )
    expect(toolCount(card), 'an empty registry yields a card advertising no tools').toBe(0)
  })
})

// ── Phase 2 — populated registry. THIS IS THE FLOOR ASSERTION. ──────────────

describe('FEL-423 phase 2 — the floor: a populated registry must reach the documents', () => {
  const TAG = 'floor-probe-root'

  it('registryIsShared — the plugin observes the same registry this test writes to', () => {
    registerAgentMetadata({
      tag: TAG,
      describes: 'A probe component used to prove the registry reaches the served documents.',
      actions: {
        increment: {
          describe: 'Increment the counter by one.',
          params: { properties: {}, required: [] },
          returns: { count: { type: 'number' } },
        },
        setLabel: {
          describe: 'Set the counter label.',
          params: { properties: { label: { type: 'string' } }, required: ['label'] },
          returns: { label: { type: 'string' } },
        },
      },
      state: { count: 'The current counter value.' },
    })

    // If this fails, the test imported a different @aihu/agent instance than
    // the readiness plugin did, and every assertion below would be vacuous.
    const tags = getAllAgentMetadata().map((m) => m.tag)
    expect(tags, 'registration must be visible through the resolved package').toContain(TAG)
  })

  for (const [label, gen] of [
    ['full', fullReadinessTs],
    ['agent', agentReadinessTs],
  ] as const) {
    it(`${label} template: llms.txt lists components and the MCP card advertises >= 1 tool`, async () => {
      const mod = await loadGenerated(gen('floor-probe'), `${label}-full`)

      const llms = await (await fetchPath(mod, '/llms.txt')).text()
      const card = await (await fetchPath(mod, '/.well-known/mcp/server-card.json')).json()

      expect(llms, 'a populated registry MUST produce a Components section').toContain(
        '## Components',
      )
      expect(llms, 'the registered tag must appear in the served document').toContain(TAG)

      // THE FLOOR. "Right paths, zero capabilities" is the defect; a card that
      // parses but advertises nothing must never pass this file.
      expect(
        toolCount(card),
        'MCP server card must advertise at least one tool — a zero-tool card at the ' +
          'right path is indistinguishable from a real one to anything that reads it',
      ).toBeGreaterThanOrEqual(1)
    })
  }

  it('the A2A card carries registry-derived skills, not an empty skills array', async () => {
    const mod = await loadGenerated(fullReadinessTs('floor-probe'), 'full-a2a')
    const card = (await (await fetchPath(mod, '/.well-known/agent-card.json')).json()) as {
      skills?: unknown[]
    }

    // `a2aCard: true` alone emits a card with NO skills — it does not read the
    // registry itself. Both templates pass `skillsFromRegistry()` explicitly,
    // and this is the assertion that keeps them doing so.
    expect(
      Array.isArray(card.skills) ? card.skills.length : 0,
      'a2aCard must receive skillsFromRegistry(); `a2aCard: true` yields zero skills',
    ).toBeGreaterThanOrEqual(1)
  })
})
