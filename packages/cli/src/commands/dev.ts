/**
 * `aihu dev [options]` — start development server.
 *
 * Reads `aihu.config.ts` from CWD to detect bundler. Default: 'vite'.
 * Vite is spawned as a node subprocess (not programmatic createServer) so
 * that @cloudflare/vite-plugin's Environment API works correctly.
 *
 * TTY detection controls output handling:
 *   - TTY (direct terminal): stdio:inherit — ANSI renders natively.
 *   - Non-TTY (piped via moon/CI): pipe + strip ANSI — clean plain text.
 *
 * Flags: --port <n>  --host <h>  --open  --help
 */

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { loadProjectConfig } from '../load-project-config.js'

// ANSI pattern built via constructor to satisfy biome noControlCharactersInRegex.
const ANSI_RE = new RegExp(`${String.fromCharCode(0x1b)}\\[[\\d;]*[A-Za-z]`, 'g')
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '')
}

const NOISE: RegExp[] = [
  /Re-optimizing dependencies/,
  /Default inspector port \d+ not available/,
  /^\s*$/,
]

function isNoise(plain: string): boolean {
  return NOISE.some((r) => r.test(plain))
}

function pipePlainText(child: ReturnType<typeof spawn>): void {
  let outBuf = ''
  let errBuf = ''

  const flush = (buf: string, dest: NodeJS.WriteStream): string => {
    const lines = buf.split('\n')
    const partial = lines.pop() ?? ''
    for (const line of lines) {
      const plain = stripAnsi(line)
      if (!isNoise(plain)) dest.write(`${plain}\n`)
    }
    return partial
  }

  child.stdout?.on('data', (chunk: Buffer) => {
    outBuf = flush(outBuf + chunk.toString(), process.stdout)
  })
  child.stdout?.on('end', () => {
    const plain = stripAnsi(outBuf)
    if (plain && !isNoise(plain)) process.stdout.write(`${plain}\n`)
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    errBuf = flush(errBuf + chunk.toString(), process.stderr)
  })
  child.stderr?.on('end', () => {
    const plain = stripAnsi(errBuf)
    if (plain && !isNoise(plain)) process.stderr.write(`${plain}\n`)
  })
}

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
  // vite.config.ts first, legacy aihu.config.ts as fallback. See
  // load-project-config.ts for why the Vite config is canonical.
  const loaded = await loadProjectConfig(cwd)
  return loaded ? (loaded.config as DevAihuConfig) : null
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

  const viteArgs: string[] = []
  if (flags.port !== undefined) viteArgs.push('--port', String(flags.port))
  if (flags.host !== undefined) viteArgs.push('--host', flags.host)
  if (flags.open) viteArgs.push('--open')

  const isTTY = process.stdout.isTTY === true

  const child = spawn('node', ['--no-deprecation', viteBin, ...viteArgs], {
    stdio: isTTY ? 'inherit' : ['inherit', 'pipe', 'pipe'],
    shell: false,
    // Strip NO_COLOR so vite emits ANSI when piped (we strip it ourselves).
    env: isTTY ? process.env : { ...process.env, NO_COLOR: undefined, FORCE_COLOR: '1' },
  })

  if (!isTTY) pipePlainText(child)

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
