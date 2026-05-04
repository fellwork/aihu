/**
 * `scribe app <name>` — scaffold a new scribe application.
 *
 * Creates the full project skeleton under `targetDir/<name>/`:
 *   package.json, scribe.config.ts, vite.config.ts,
 *   src/pages/index.scribe, src/layouts/default.scribe
 *
 * Zero external dependencies — uses only Node/Bun builtins (fs, path).
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

function writeFile(filePath: string, content: string): void {
  const dir = dirname(filePath)
  if (dir) mkdirSync(dir, { recursive: true })
  writeFileSync(filePath, content, 'utf8')
}

/**
 * Scaffold a new scribe app named `name` under `targetDir/<name>/`.
 */
export function scaffoldApp(name: string, targetDir: string): void {
  const root = join(targetDir, name)

  // package.json
  const pkgJson = {
    name,
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      preview: 'vite preview',
    },
    dependencies: {
      '@scribe/server': 'latest',
      '@scribe/router': 'latest',
      '@scribe/runtime': 'latest',
      '@scribe/arbor': 'latest',
      '@scribe/signals': 'latest',
      '@scribe/agent': 'latest',
    },
    devDependencies: {
      '@scribe/cli': 'latest',
      vite: '^5.0.0',
    },
  }
  writeFile(join(root, 'package.json'), `${JSON.stringify(pkgJson, null, 2)}\n`)

  // scribe.config.ts
  const scribeConfig = `import { defineScribeConfig } from '@scribe/server'

export default defineScribeConfig({
  build: { target: 'universal' },
})
`
  writeFile(join(root, 'scribe.config.ts'), scribeConfig)

  // vite.config.ts
  const viteConfig = `import { defineConfig } from 'vite'
import { viteRouterIntegration } from '@scribe/router'
import { viteAgentReadinessIntegration } from '@scribe/agent-readiness'

export default defineConfig({
  plugins: [
    viteRouterIntegration(),
    viteAgentReadinessIntegration(),
  ],
})
`
  writeFile(join(root, 'vite.config.ts'), viteConfig)

  // src/pages/index.scribe
  const indexScribe = `@state {
  $prop name: string = 'world'
}

@template {
  <div>Hello {{ name }}</div>
}

@route {
  path: /
  name: home
}
`
  writeFile(join(root, 'src/pages/index.scribe'), indexScribe)

  // src/layouts/default.scribe
  const defaultScribe = `@template {
  <slot />
}
`
  writeFile(join(root, 'src/layouts/default.scribe'), defaultScribe)

  process.stdout.write(`✓ Created ${name}/\n  cd ${name}\n  bun install\n  bun run dev\n`)
}
