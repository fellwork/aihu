/**
 * Fixtures for `scripts/dep-check.ts`'s `checkUseSubpathPurity()` — the
 * mechanism that enforces the revised `@aihu/use` namespace contract (CORE
 * dependency-free; FAMILY subpaths may declare optional peers, isolated per
 * entry). A gate with no negative test is a gate that silently stops
 * working, so this file builds real temp `packages/use`-shaped trees on disk
 * (the function walks the filesystem) and asserts both the green path and
 * the three FAIL cases the design calls out:
 *   1. a CORE entry statically importing a family file
 *   2. a family entry importing a different family's file
 *   3. a family member importing a peer it does not own
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkUseSubpathPurity } from '../scripts/dep-check.ts'

let dir: string | undefined

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = undefined
})

async function write(root: string, rel: string, content: string): Promise<void> {
  const path = join(root, rel)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, content)
}

/** A minimal, otherwise-green `packages/use` tree: one core composable, one
 * math member + aggregate, one integrations member with its own peer. */
async function baseFixture(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), 'use-purity-'))
  await write(
    root,
    'families.json',
    JSON.stringify({
      families: {
        math: {
          aggregate: true,
          autoImport: true,
          memberLimit: '250 B',
          aggregateLimit: '1200 B',
          peers: {},
        },
        integrations: {
          aggregate: false,
          autoImport: false,
          memberLimit: '600 B',
          peers: { useJwt: ['jwt-decode'] },
        },
      },
    }),
  )
  await write(
    root,
    'package.json',
    JSON.stringify({
      name: '@aihu/use',
      peerDependencies: { 'jwt-decode': '>=4' },
      peerDependenciesMeta: { 'jwt-decode': { optional: true } },
      devDependencies: { 'jwt-decode': '^4' },
    }),
  )
  await write(
    root,
    'rolldown.config.ts',
    [
      'export default {',
      '  input: {',
      "    index: 'src/index.ts',",
      "    shared: 'src/shared/index.ts',",
      "    useMouse: 'src/useMouse/index.ts',",
      "    math: 'src/math/index.ts',",
      "    'math/useClamp': 'src/math/useClamp/index.ts',",
      "    'integrations/useJwt': 'src/integrations/useJwt/index.ts',",
      '  },',
      '}',
    ].join('\n'),
  )
  await write(root, 'src/shared/index.ts', 'export const isClient = false\n')
  await write(root, 'src/index.ts', "export { useMouse } from './useMouse/index.ts'\n")
  await write(
    root,
    'src/useMouse/index.ts',
    "import { isClient } from '../shared/index.ts'\nexport function useMouse() {}\n",
  )
  await write(root, 'src/math/index.ts', "export { useClamp } from './useClamp/index.ts'\n")
  await write(
    root,
    'src/math/useClamp/index.ts',
    "import { isClient } from '../../shared/index.ts'\nexport function useClamp() {}\n",
  )
  await write(
    root,
    'src/integrations/useJwt/index.ts',
    "import { jwtDecode } from 'jwt-decode'\nexport function useJwt() { return jwtDecode }\n",
  )
  return root
}

describe('checkUseSubpathPurity', () => {
  it('green path: passes with no violations', async () => {
    dir = await baseFixture()
    const result = checkUseSubpathPurity(dir)
    expect(result.errors).toEqual([])
    expect(result.pass).toBe(true)
  })

  it('FAIL: a CORE entry statically importing a family file', async () => {
    dir = await baseFixture()
    await write(
      dir,
      'src/useMouse/index.ts',
      "import { isClient } from '../shared/index.ts'\nimport '../math/useClamp/index.ts'\nexport function useMouse() {}\n",
    )
    const result = checkUseSubpathPurity(dir)
    expect(result.pass).toBe(false)
    expect(
      result.errors.some((e) => e.includes("core entry 'useMouse'") && e.includes('family file')),
    ).toBe(true)
  })

  it('FAIL: a family entry importing a different family file', async () => {
    dir = await baseFixture()
    await write(
      dir,
      'families.json',
      JSON.stringify({
        families: {
          math: {
            aggregate: true,
            autoImport: true,
            memberLimit: '250 B',
            aggregateLimit: '1200 B',
            peers: {},
          },
          motion: {
            aggregate: true,
            autoImport: true,
            memberLimit: '900 B',
            aggregateLimit: '3 KB',
            peers: {},
          },
          integrations: {
            aggregate: false,
            autoImport: false,
            memberLimit: '600 B',
            peers: { useJwt: ['jwt-decode'] },
          },
        },
      }),
    )
    await write(
      dir,
      'rolldown.config.ts',
      [
        'export default {',
        '  input: {',
        "    index: 'src/index.ts',",
        "    shared: 'src/shared/index.ts',",
        "    useMouse: 'src/useMouse/index.ts',",
        "    math: 'src/math/index.ts',",
        "    'math/useClamp': 'src/math/useClamp/index.ts',",
        "    'motion/useReducedMotion': 'src/motion/useReducedMotion/index.ts',",
        "    'integrations/useJwt': 'src/integrations/useJwt/index.ts',",
        '  },',
        '}',
      ].join('\n'),
    )
    await write(
      dir,
      'src/motion/useReducedMotion/index.ts',
      "import { useClamp } from '../../math/useClamp/index.ts'\nexport function useReducedMotion() { return useClamp }\n",
    )
    const result = checkUseSubpathPurity(dir)
    expect(result.pass).toBe(false)
    expect(
      result.errors.some(
        (e) => e.includes("'motion/useReducedMotion'") && e.includes("family 'math'"),
      ),
    ).toBe(true)
  })

  it('FAIL: a family member importing a peer it does not own', async () => {
    dir = await baseFixture()
    await write(
      dir,
      'src/integrations/useJwt/index.ts',
      "import axios from 'axios'\nexport function useJwt() { return axios }\n",
    )
    const result = checkUseSubpathPurity(dir)
    expect(result.pass).toBe(false)
    expect(
      result.errors.some((e) => e.includes("'integrations/useJwt'") && e.includes("'axios'")),
    ).toBe(true)
  })

  it('FAIL: an optional peer declared in package.json but not claimed by families.json', async () => {
    dir = await baseFixture()
    await write(
      dir,
      'package.json',
      JSON.stringify({
        name: '@aihu/use',
        peerDependencies: { 'jwt-decode': '>=4', axios: '>=1' },
        peerDependenciesMeta: { 'jwt-decode': { optional: true }, axios: { optional: true } },
        devDependencies: { 'jwt-decode': '^4', axios: '^1' },
      }),
    )
    const result = checkUseSubpathPurity(dir)
    expect(result.pass).toBe(false)
    expect(result.errors.some((e) => e.includes("'axios'") && e.includes('orphaned peer'))).toBe(
      true,
    )
  })
})
