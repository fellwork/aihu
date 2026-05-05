/**
 * `aihu page <route>` — add a page to an existing aihu project.
 *
 * Writes `src/pages/<route>.aihu` relative to `targetDir`.
 * Zero external dependencies — uses only Node/Bun builtins (fs, path).
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Scaffold a new page for `route` inside an existing project at `targetDir`.
 */
export function scaffoldPage(route: string, targetDir: string): void {
  const pagesDir = join(targetDir, 'src', 'pages')
  mkdirSync(pagesDir, { recursive: true })

  const filePath = join(pagesDir, `${route}.aihu`)
  const content = `@state {
}

@template {
  <div>${route} page</div>
}

@route {
  path: /${route}
  name: ${route}
}
`
  writeFileSync(filePath, content, 'utf8')
  process.stdout.write(`✓ Created src/pages/${route}.aihu\n`)
}
