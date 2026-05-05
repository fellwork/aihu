#!/usr/bin/env bun
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// On Windows, new URL().pathname has a leading slash before the drive letter.
// Use import.meta.dirname for a reliable path.
const root = join(import.meta.dirname, '..')
const packagesDir = join(root, 'packages')

const packages = readdirSync(packagesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)

const ALLOWED_PEER_PATTERNS = ['@aihu/', 'vite']
const ALLOWED_DEP_PATTERNS = ['@aihu/']

let pass = true

for (const pkg of packages) {
  const pkgJsonPath = join(packagesDir, pkg, 'package.json')
  let pkgJson: {
    name?: string
    dependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
  }
  try {
    pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
  } catch {
    continue
  }

  const deps = Object.keys(pkgJson.dependencies ?? {})
  const peers = Object.keys(pkgJson.peerDependencies ?? {})
  const opts = Object.keys(pkgJson.optionalDependencies ?? {})

  for (const dep of deps) {
    if (!ALLOWED_DEP_PATTERNS.some((p) => dep.startsWith(p))) {
      console.error(`FAIL [${pkgJson.name}] runtime dep not allowed: ${dep}`)
      pass = false
    }
  }
  for (const dep of [...peers, ...opts]) {
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
