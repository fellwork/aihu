/**
 * `scribe plugin <name>` — scaffold a plugin package skeleton.
 *
 * Creates `<name>/` under `targetDir` with:
 *   package.json, src/index.ts
 *
 * Zero external dependencies — uses only Node/Bun builtins (fs, path).
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Scaffold a new plugin package named `name` under `targetDir/<name>/`.
 */
export function scaffoldPlugin(name: string, targetDir: string): void {
  const root = join(targetDir, name)
  const srcDir = join(root, 'src')
  mkdirSync(srcDir, { recursive: true })

  // package.json
  const pkgJson = {
    name,
    version: '0.1.0',
    type: 'module',
    exports: { '.': './dist/index.js' },
    peerDependencies: {
      '@scribe/plugin': 'latest',
    },
  }
  writeFileSync(join(root, 'package.json'), JSON.stringify(pkgJson, null, 2) + '\n', 'utf8')

  // src/index.ts
  const indexTs = `import { definePlugin } from '@scribe/plugin'

export default definePlugin({
  name: '${name}',
  version: '0.1.0',
  namespace: '${name}',
  contributes: {},
})
`
  writeFileSync(join(srcDir, 'index.ts'), indexTs, 'utf8')

  process.stdout.write(`✓ Created ${name}/\n`)
}
