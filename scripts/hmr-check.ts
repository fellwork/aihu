#!/usr/bin/env bun
// scripts/hmr-check.ts
// Checks that no package source files reference @vitejs/client directly.
// HMR in scribe is handled natively — no @vitejs/client dependency is expected.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// On Windows, new URL().pathname has a leading slash before the drive letter.
// Use import.meta.dirname for a reliable path.
const root = join(import.meta.dirname, '..')
const packagesDir = join(root, 'packages')

const packages = readdirSync(packagesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)

const TARGET = '@vitejs/client'

let found = false
const hits: string[] = []

function scanDir(dir: string): void {
  let entries: ReturnType<typeof readdirSync>
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      scanDir(full)
    } else if (entry.isFile() && /\.(ts|js|mts|mjs)$/.test(entry.name)) {
      let content: string
      try {
        content = readFileSync(full, 'utf-8')
      } catch {
        continue
      }
      if (content.includes(TARGET)) {
        hits.push(full)
        found = true
      }
    }
  }
}

for (const pkg of packages) {
  const srcDir = join(packagesDir, pkg, 'src')
  scanDir(srcDir)
}

if (found) {
  console.error(`FAIL: ${TARGET} found in package sources:`)
  for (const h of hits) console.error(`  ${h}`)
  process.exit(1)
} else {
  console.log('✓ No @vitejs/client in package sources (HMR is scribe-native)')
  process.exit(0)
}
