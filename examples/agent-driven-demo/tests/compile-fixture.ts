/**
 * vitest globalSetup — compile the REAL `src/task-list.aihu` with the REAL
 * `@aihu/compiler` binary (`--target client`) BEFORE tests are collected, and
 * write it to `tests/__generated__/task-list.client.ts`.
 *
 * This must run at globalSetup time (not in `beforeAll`) so Vite's static
 * import-analysis can resolve the `import('./__generated__/task-list.client.ts')`
 * in the test when the module graph is built. The artifact is the genuine
 * compiler output — never hand-written — so the test drives the real component.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ext = process.platform === 'win32' ? '.exe' : ''

export default function setup(): void {
  const src = resolve(__dirname, '../src/task-list.aihu')
  const bin = resolve(__dirname, `../../../packages/compiler/bin/aihu-compile${ext}`)
  const compiled = execFileSync(
    bin,
    ['--stdin', '--tag', 'task-list', '--path', src, '--target', 'client'],
    { input: readFileSync(src, 'utf8'), encoding: 'utf8' },
  )
  const genDir = resolve(__dirname, '__generated__')
  mkdirSync(genDir, { recursive: true })
  writeFileSync(resolve(genDir, 'task-list.client.ts'), compiled, 'utf8')
}
