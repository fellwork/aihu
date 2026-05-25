#!/usr/bin/env bun

/**
 * Parallel dev server launcher for all examples.
 *
 * Globs for examples/<asterisk>/vite.config.ts, reads the assigned port from each
 * example's package.json `dev` script, then spawns each on that port in
 * parallel. Ctrl-C kills all child processes.
 *
 * Usage: bun scripts/dev-examples.ts
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// fileURLToPath (not `.pathname`) so the repo root is a valid OS path on
// Windows too — `.pathname` yields a leading-slash drive path (`/C:/…`) that
// Bun.Glob.scanSync and child `cwd` cannot open.
const ROOT = fileURLToPath(new URL('..', import.meta.url))

const configs = Array.from(new Bun.Glob('examples/*/vite.config.ts').scanSync(ROOT))

if (configs.length === 0) {
  console.error('No examples/*/vite.config.ts found.')
  process.exit(1)
}

interface ExampleInfo {
  dir: string
  name: string
  port: number
}

function readPort(exampleDir: string): number | null {
  try {
    const pkgPath = join(ROOT, exampleDir, 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    const devScript: string = pkg?.scripts?.dev ?? ''
    const match = devScript.match(/--port\s+(\d+)/)
    return match ? parseInt(match[1], 10) : null
  } catch {
    return null
  }
}

const examples: ExampleInfo[] = configs
  .map((configPath) => {
    const exampleDir = dirname(configPath)
    const port = readPort(exampleDir)
    const name = exampleDir.replace('examples/', '')
    return port ? { dir: exampleDir, name, port } : null
  })
  .filter((e): e is ExampleInfo => e !== null)
  .sort((a, b) => a.port - b.port)

if (examples.length === 0) {
  console.error('No examples with --port in dev script found.')
  process.exit(1)
}

console.log(`Starting ${examples.length} example dev servers:\n`)
examples.forEach(({ name, port }) => {
  console.log(`  ${name.padEnd(28)} -> http://localhost:${port}`)
})
console.log()

const procs = examples.map(({ dir, name, port }) => {
  const proc = Bun.spawn(['bun', 'run', 'dev'], {
    cwd: join(ROOT, dir),
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env },
  })

  const prefix = `[${name}:${port}]`
  const decoder = new TextDecoder()

  ;(async () => {
    for await (const chunk of proc.stdout) {
      const lines = decoder.decode(chunk).split('\n')
      lines.forEach((line) => {
        if (line.trim()) console.log(`${prefix} ${line}`)
      })
    }
  })()

  ;(async () => {
    for await (const chunk of proc.stderr) {
      const lines = decoder.decode(chunk).split('\n')
      lines.forEach((line) => {
        if (line.trim()) console.error(`${prefix} ${line}`)
      })
    }
  })()

  return proc
})

process.on('SIGINT', () => {
  console.log('\nShutting down all example servers...')
  procs.forEach((p) => p.kill())
  process.exit(0)
})

await Promise.all(procs.map((p) => p.exited))
