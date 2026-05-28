#!/usr/bin/env bun
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BUILD_DEV_ONLY, SERVER_SIDE } from './check-size-rows.ts'

// On Windows, new URL().pathname has a leading slash before the drive letter.
// Use import.meta.dirname for a reliable path.
const root = join(import.meta.dirname, '..')
const packagesDir = join(root, 'packages')

const packages = readdirSync(packagesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)

const ALLOWED_PEER_PATTERNS = ['@aihu/', '@aihu-plugin/', 'vite']
const ALLOWED_DEP_PATTERNS = ['@aihu/', '@aihu-plugin/']

// Editor extensions (e.g. VSCode language clients) are out of scope for the
// browser-bundle dep-free thesis. They ship as editor tooling, not user-app
// runtime surfaces. Per `.size-limit.README.md`, the dep-free contract is a
// browser-bundle thesis; non-browser packages (server-side, build/dev-only,
// editor) don't fall under it.
const EDITOR_EXTENSIONS = new Set<string>(['vscode-aihu'])

let pass = true

for (const pkg of packages) {
  const pkgJsonPath = join(packagesDir, pkg, 'package.json')
  let pkgJson: {
    name?: string
    dependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
    peerDependenciesMeta?: Record<string, { optional?: boolean }>
    optionalDependencies?: Record<string, string>
  }
  try {
    pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
  } catch {
    continue
  }

  // Skip non-browser packages — the dep-free thesis is a browser-bundle
  // contract per `.size-limit.README.md`. Server-side and build/dev-only
  // packages are budgeted by other means; editor extensions ship through
  // marketplaces, not browser bundles. Re-uses `SERVER_SIDE` and
  // `BUILD_DEV_ONLY` from `check-size-rows.ts` as the single source of truth.
  const name = pkgJson.name ?? ''
  if (SERVER_SIDE.has(name) || BUILD_DEV_ONLY.has(name) || EDITOR_EXTENSIONS.has(name)) {
    continue
  }

  const deps = Object.keys(pkgJson.dependencies ?? {})
  const peers = Object.keys(pkgJson.peerDependencies ?? {})
  const opts = Object.keys(pkgJson.optionalDependencies ?? {})
  const peerMeta = pkgJson.peerDependenciesMeta ?? {}

  for (const dep of deps) {
    if (!ALLOWED_DEP_PATTERNS.some((p) => dep.startsWith(p))) {
      console.error(`FAIL [${pkgJson.name}] runtime dep not allowed: ${dep}`)
      pass = false
    }
  }
  for (const dep of [...peers, ...opts]) {
    // Optional peers are zero-install (not in `npm ls --production` by
    // default); the v1 plan §"Per-version dep envelope" explicitly authorizes
    // peer-optional alongside build-time / dev-time. Skip them.
    if (peers.includes(dep) && peerMeta[dep]?.optional === true) {
      continue
    }
    if (!ALLOWED_PEER_PATTERNS.some((p) => dep.startsWith(p))) {
      console.error(`FAIL [${pkgJson.name}] peer/optional dep not allowed: ${dep}`)
      pass = false
    }
  }
}

if (pass) {
  console.log('✓ All packages pass dep-free check (v3 thesis)')
  process.exit(0)
} else {
  process.exit(1)
}
