/**
 * `aihu app <name>` — scaffold a new aihu application.
 *
 * Creates the full project skeleton under `targetDir/<name>/`:
 *   package.json, aihu.config.ts, vite.config.ts,
 *   src/pages/index.aihu, src/layouts/default.aihu
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
 * Scaffold a new aihu app named `name` under `targetDir/<name>/`.
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
      '@aihu/server': 'latest',
      '@aihu/router': 'latest',
      '@aihu/runtime': 'latest',
      '@aihu/arbor': 'latest',
      '@aihu/signals': 'latest',
      '@aihu/agent': 'latest',
    },
    devDependencies: {
      '@aihu/cli': 'latest',
      vite: '^5.0.0',
    },
  }
  writeFile(join(root, 'package.json'), `${JSON.stringify(pkgJson, null, 2)}\n`)

  // aihu.config.ts
  const aihuConfig = `import { defineAihuConfig } from '@aihu/server'

export default defineAihuConfig({
  build: { target: 'universal' },
})
`
  writeFile(join(root, 'aihu.config.ts'), aihuConfig)

  // vite.config.ts
  const viteConfig = `import { defineConfig } from 'vite'
import { viteRouterIntegration } from '@aihu/router'
import { viteAgentReadinessIntegration } from '@aihu/agent-readiness'

export default defineConfig({
  plugins: [
    viteRouterIntegration(),
    viteAgentReadinessIntegration(),
  ],
})
`
  writeFile(join(root, 'vite.config.ts'), viteConfig)

  // src/pages/index.aihu
  const indexAihu = `@state {
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
  writeFile(join(root, 'src/pages/index.aihu'), indexAihu)

  // src/layouts/default.aihu
  const defaultAihu = `@template {
  <slot />
}
`
  writeFile(join(root, 'src/layouts/default.aihu'), defaultAihu)

  process.stdout.write(`✓ Created ${name}/\n  cd ${name}\n  bun install\n  bun run dev\n`)
}
