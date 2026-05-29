/**
 * @aihu/ui registry generator tests (Plan 5 Task 4, R3 index-only).
 *
 * Drives `generateRegistry`/`serializeRegistry` over a synthetic fixture
 * `registry/` (built in a temp dir) so the assertions do not depend on the
 * Phase 1 recipes (Task 5). Asserts: items match the fixtures; every
 * `RegistryFile` has `path` set but `source` UNSET (index-only); re-running is
 * byte-identical (determinism); `registryDependencies` is preserved.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { generateRegistry, serializeRegistry } from '../scripts/gen-registry.ts'

let registryRoot: string
let tmp: string

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'aihu-ui-gen-'))
  registryRoot = join(tmp, 'registry')

  // recipe `button`: npm dep, empty registryDependencies, variants (R5 shape).
  const buttonDir = join(registryRoot, 'button')
  mkdirSync(buttonDir, { recursive: true })
  writeFileSync(join(buttonDir, 'button.aihu'), '<!-- button recipe -->\n')
  writeFileSync(
    join(buttonDir, 'meta.json'),
    JSON.stringify({
      name: 'button',
      type: 'ui',
      description: 'A styled button recipe.',
      dependencies: ['@aihu/primitives'],
      registryDependencies: [],
      variants: { variant: ['default', 'destructive'], size: ['sm', 'md', 'lg'] },
    }),
  )

  // recipe `card`: presentational, no deps, declares a registryDependency on
  // `button` to exercise the registryDependencies-preserved assertion.
  const cardDir = join(registryRoot, 'card')
  mkdirSync(cardDir, { recursive: true })
  writeFileSync(join(cardDir, 'card.aihu'), '<!-- card recipe -->\n')
  writeFileSync(
    join(cardDir, 'meta.json'),
    JSON.stringify({
      name: 'card',
      type: 'ui',
      registryDependencies: ['button'],
    }),
  )
})

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('generateRegistry', () => {
  it('emits one item per recipe directory, alpha-sorted by name', () => {
    const registry = generateRegistry(registryRoot)
    expect(registry.items.map((i) => i.name)).toEqual(['button', 'card'])
  })

  it('matches the fixture metadata (name, type, variants, dependencies)', () => {
    const registry = generateRegistry(registryRoot)
    const button = registry.items.find((i) => i.name === 'button')!
    expect(button.type).toBe('ui')
    expect(button.description).toBe('A styled button recipe.')
    expect(button.dependencies).toEqual(['@aihu/primitives'])
    expect(button.variants).toEqual({
      variant: ['default', 'destructive'],
      size: ['sm', 'md', 'lg'],
    })
  })

  it('emits RegistryFile entries with `path` set but `source` UNSET (index-only, R3)', () => {
    const registry = generateRegistry(registryRoot)
    const allFiles = registry.items.flatMap((i) => i.files)
    expect(allFiles.length).toBeGreaterThan(0)
    for (const file of allFiles) {
      expect(file.path).toBeTruthy()
      expect(file.path).toMatch(/^registry\//)
      expect(file).not.toHaveProperty('source')
      expect(file.type).toBe('component')
    }
    const button = registry.items.find((i) => i.name === 'button')!
    expect(button.files).toEqual([{ path: 'registry/button/button.aihu', type: 'component' }])
  })

  it('preserves registryDependencies', () => {
    const registry = generateRegistry(registryRoot)
    const card = registry.items.find((i) => i.name === 'card')!
    expect(card.registryDependencies).toEqual(['button'])
    const button = registry.items.find((i) => i.name === 'button')!
    expect(button.registryDependencies).toEqual([])
  })

  it('re-running is byte-identical (deterministic / idempotent)', () => {
    const first = serializeRegistry(generateRegistry(registryRoot))
    const second = serializeRegistry(generateRegistry(registryRoot))
    expect(second).toBe(first)
  })

  it('returns an empty index for a missing registry root', () => {
    expect(generateRegistry(join(tmp, 'does-not-exist'))).toEqual({ items: [] })
  })

  it('throws when a recipe directory lacks meta.json', () => {
    const broken = join(tmp, 'broken')
    mkdirSync(join(broken, 'orphan'), { recursive: true })
    writeFileSync(join(broken, 'orphan', 'orphan.aihu'), 'x\n')
    expect(() => generateRegistry(broken)).toThrow(/meta\.json is missing/)
  })
})
