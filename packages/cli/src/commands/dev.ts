/**
 * `aihu dev [options]` — start development server.
 *
 * Reads `aihu.config.ts` from CWD to detect bundler. Default: 'vite'.
 * Bundlers loaded via dynamic import() so the CLI binary loads instantly
 * regardless of which bundler is installed in the user's project.
 *
 * Zero new runtime deps. Bundlers (vite, rolldown) are peer deps in
 * the user's project. arch-4 §3.
 *
 * Flags: --port <n>  --host <h>  --open  --help
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

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

async function runVite(flags: DevFlags): Promise<void> {
  type ViteServer = {
    listen: (port?: number) => Promise<{ printUrls: () => void }>
    close: () => Promise<void>
  }
  type ViteModule = {
    createServer: (opts: Record<string, unknown>) => Promise<ViteServer>
  }

  let vite: ViteModule
  try {
    vite = (await import(/* @vite-ignore */ 'vite')) as unknown as ViteModule
  } catch {
    process.stderr.write('vite not installed; run: bun add -d vite\n')
    process.exit(1)
  }

  const serverOptions: Record<string, unknown> = { open: flags.open }
  if (flags.port !== undefined) serverOptions.port = flags.port
  if (flags.host !== undefined) serverOptions.host = flags.host

  const server = await vite.createServer({ server: serverOptions })
  const listening = await server.listen(flags.port)
  listening.printUrls()

  const cleanup = (): void => {
    void server.close().then(() => process.exit(0))
  }
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
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
    await runVite(flags)
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
