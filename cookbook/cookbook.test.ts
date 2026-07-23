/**
 * Cookbook compile test — verifies every .aihu SFC in cookbook/ compiles
 * cleanly via the aihu compiler and produces valid output.
 *
 * v0.5.0: 21 CI-protected SFCs covering the core v0.4 feature surface
 * plus the @aihu/use composable auto-import pattern (use-mouse).
 *
 * Run: bun test cookbook/cookbook.test.ts
 * Env: set AIHU_COMPILE_BIN to a pre-built aihu-compile binary if the
 *      repo does not have one in packages/compiler/bin/.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform } from '../packages/compiler/js/index.ts'

const cookbookDir = resolve(import.meta.dirname, '.')
const sfcFiles = readdirSync(cookbookDir).filter((f) => f.endsWith('.aihu'))

describe('cookbook compile test', () => {
  it('finds exactly 21 .aihu SFCs', () => {
    expect(sfcFiles.length).toBe(21)
  })

  for (const file of sfcFiles) {
    it(`compiles ${file}`, () => {
      const src = readFileSync(join(cookbookDir, file), 'utf8')
      // transform() throws if compilation fails — any error fails the test
      const result = transform(src, join(cookbookDir, file), {})
      // The compiler emits defineElement('tag', defineComponent(...)) for every SFC
      expect(result.code).toContain('defineElement')
      expect(result.code).toContain('defineComponent')
    })
  }
})
