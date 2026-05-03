/**
 * `scribe component <name>` — scaffold a .scribe component.
 *
 * Writes `src/components/<name>.scribe` relative to `targetDir`.
 * Zero external dependencies — uses only Node/Bun builtins (fs, path).
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Scaffold a new component named `name` inside an existing project at `targetDir`.
 */
export function scaffoldComponent(name: string, targetDir: string): void {
  const componentsDir = join(targetDir, 'src', 'components')
  mkdirSync(componentsDir, { recursive: true })

  const filePath = join(componentsDir, `${name}.scribe`)
  const content = `@state {
}

@template {
  <div>${name}</div>
}
`
  writeFileSync(filePath, content, 'utf8')
  process.stdout.write(`✓ Created src/components/${name}.scribe\n`)
}
