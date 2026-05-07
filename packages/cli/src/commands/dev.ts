/**
 * `aihu dev [options]` — start development server.
 *
 * Reads `aihu.config.ts` from CWD to detect bundler. Default: 'vite'.
 * Vite is spawned as a node subprocess so that @cloudflare/vite-plugin's
 * Environment API works correctly (programmatic createServer() does not
 * support it). stdio: 'inherit' preserves native ANSI rendering in the
 * caller's terminal without buffering.
 *
 * Flags: --port <n>  --host <h>  --open  --help
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

interface DevAihuConfig {
  build?: { bundler?: string }
}

interface DevFlags {
  port: number | undefined
  host: string | undefined
  open: boolean
  help: boolean
}

function parseFlags(args: readonly string[]): DevFlags {
  let port: number | undefined
  let host: string | undefined
  let open = false
  let help = false

  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    if (a === '--help' || a === '-h') help = true
    else if (a === '--open') open = true
    else if (a === '--port') {
      const next = args[i + 1]
      if (next !== undefined) {
        port = Number.parseInt(next, 10)
        i++
      }
    } else if (a.startsWith('--port=')) {
      port = Number.parseInt(a.slice('--port='.length), 10)
    } else if (a === '--host') {
      const next = args[i + 1]
      if (next !== undefined) {
        host = next
        i++
      }
    } else if (a.startsWith('--host=')) {
      host = a.slice('--host='.length)
    }
  }
  return { port, host, open, help }
}

function printHelp(): void {
  process.stdout.write(
    [
      'Usage: aihu dev [options]',
      '',
      'Start the development server.',
      '',
      'Options:',
      '  --port <n>    Port to listen on',
      '  --host <h>    Host to bind (default: localhost)',
      '  --open        Open browser on start',
      '  --help, -h    Show this help',
      '',
      'Bundler is detected from aihu.config.ts build.bundler (default: vite).',
      'If vite is not installed:     bun add -d vite',
      'If rolldown is not installed: bun add -d rolldown',
      '',
    ].join('\n'),
  )
}

async function loadConfig(cwd: string): Promise<DevAihuConfig | null> {
  const configPath = join(cwd, 'aihu.config.ts')
  if (!existsSync(configPath)) return null
  try {
    const mod = (await import(configPath)) as { default?: DevAihuConfig }
    return mod.default ?? {}
  } catch {
    return {}
  }
}

function runVite(flags: DevFlags): void {
  let viteBin: string
  try {
    const req = createRequire(join(process.cwd(), 'package.json'))
    const pkgJsonPath = req.resolve('vite/package.json')
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as {
      bin?: Record<string, string> | string
    }
    const pkgRoot = dirname(pkgJsonPath)
    const binEntry = typeof pkgJson.bin === 'object' ? pkgJson.bin.vite : pkgJson.bin
    viteBin = join(pkgRoot, binEntry ?? 'bin/vite.js')
  } catch {
    process.stderr.write('vite not installed; run: bun add -d vite\n')
    process.exit(1)
  }

  const args: string[] = []
  if (flags.port !== undefined) args.push('--port', String(flags.port))
  if (flags.host !== undefined) args.push('--host', flags.host)
  if (flags.open) args.push('--open')

  // --no-deprecation suppresses Node runtime warnings (e.g. punycode DEP0040).
  // stdio: 'inherit' lets the child write directly to the caller's console
  // handle so ANSI escape codes render natively without buffering.
  const child = spawn('node', ['--no-deprecation', viteBin, ...args], {
    stdio: 'inherit',
    shell: false,
  })

  const cleanup = (): void => {
    child.kill('SIGTERM')
    process.exit(0)
  }
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)

  child.on('error', (err: Error) => {
    process.stderr.write(`vite failed to start: ${err.message}\n`)
    process.exit(1)
  })
  child.on('exit', (code: number | null) => process.exit(code ?? 0))
}

function runRolldown(flags: DevFlags): void {
  const args = ['--watch']
  if (flags.port !== undefined) args.push('--port', String(flags.port))
  if (flags.host !== undefined) args.push('--host', flags.host)

  const child = spawn('rolldown', args, { stdio: 'inherit', shell: true })

  const cleanup = (): void => {
    child.kill('SIGTERM')
    process.exit(0)
  }
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)

  child.on('error', (err: Error) => {
    process.stderr.write(
      `rolldown failed to start: ${err.message}\n` +
        'Ensure rolldown is installed: bun add -d rolldown\n',
    )
    process.exit(1)
  })
  child.on('exit', (code: number | null) => process.exit(code ?? 0))
}

/** Entry point for `aihu dev`. */
export default async function dev(args: readonly string[]): Promise<void> {
  const flags = parseFlags(args)
  if (flags.help) {
    printHelp()
    process.exit(0)
  }

  const cwd = process.cwd()
  const config = await loadConfig(cwd)
  if (config === null) {
    process.stderr.write(
      'No aihu.config.ts found in current directory.\n' +
        'Create a new project with:  aihu app <name>\n' +
        'Or bootstrap with:          create-aihu\n',
    )
    process.exit(1)
  }

  const bundler = config.build?.bundler ?? 'vite'
  if (bundler === 'vite') {
    runVite(flags)
  } else if (bundler === 'rolldown') {
    runRolldown(flags)
  } else {
    process.stderr.write(
      `Unknown bundler "${bundler}" in aihu.config.ts build.bundler.\n` +
        'Supported values: "vite" | "rolldown"\n',
    )
    process.exit(1)
  }
}
