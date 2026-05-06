/**
 * `aihu build [options]` — production build.
 *
 * Same bundler detection as `aihu dev`. Reads --target flag:
 *   - 'client'    — browser-only bundle
 *   - 'server'    — SSR bundle
 *   - 'universal' — both (default)
 *
 * Zero new runtime deps. arch-4 §3.
 *
 * Flags: --target <client|server|universal>  --help
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

interface BuildAihuConfig {
  build?: { bundler?: string; target?: string }
}

interface BuildFlags {
  target: 'client' | 'server' | 'universal' | undefined
  help: boolean
}

function parseFlags(args: readonly string[]): BuildFlags {
  let target: BuildFlags['target']
  let help = false

  const isValidTarget = (s: string): s is 'client' | 'server' | 'universal' =>
    s === 'client' || s === 'server' || s === 'universal'

  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    if (a === '--help' || a === '-h') help = true
    else if (a === '--target') {
      const next = args[i + 1]
      if (next !== undefined && isValidTarget(next)) {
        target = next
        i++
      }
    } else if (a.startsWith('--target=')) {
      const v = a.slice('--target='.length)
      if (isValidTarget(v)) target = v
    }
  }
  return { target, help }
}

function printHelp(): void {
  process.stdout.write(
    [
      'Usage: aihu build [options]',
      '',
      'Production build.',
      '',
      'Options:',
      '  --target <t>   Build target: client | server | universal (default: universal)',
      '  --help, -h     Show this help',
      '',
      'Bundler is detected from aihu.config.ts build.bundler (default: vite).',
      '',
    ].join('\n'),
  )
}

async function loadConfig(cwd: string): Promise<BuildAihuConfig | null> {
  const configPath = join(cwd, 'aihu.config.ts')
  if (!existsSync(configPath)) return null
  try {
    const mod = (await import(configPath)) as { default?: BuildAihuConfig }
    return mod.default ?? {}
  } catch {
    return {}
  }
}

async function runVite(target: string): Promise<void> {
  type ViteModule = {
    build: (opts: Record<string, unknown>) => Promise<unknown>
  }
  let vite: ViteModule
  try {
    vite = (await import(/* @vite-ignore */ 'vite')) as unknown as ViteModule
  } catch {
    process.stderr.write('vite not installed; run: bun add -d vite\n')
    process.exit(1)
  }
  // Pass target as build mode env so user's vite config can branch on it.
  await vite.build({
    define: { 'import.meta.env.AIHU_TARGET': JSON.stringify(target) },
  })
}

function runRolldown(target: string): void {
  const child = spawn('rolldown', ['-c', 'rolldown.config.ts'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, AIHU_TARGET: target },
  })
  child.on('error', (err: Error) => {
    process.stderr.write(
      `rolldown failed to start: ${err.message}\n` +
        'Ensure rolldown is installed: bun add -d rolldown\n',
    )
    process.exit(1)
  })
  child.on('exit', (code: number | null) => process.exit(code ?? 0))
}

/** Entry point for `aihu build`. */
export default async function build(args: readonly string[]): Promise<void> {
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
        'Create a new project with:  aihu app <name>\n',
    )
    process.exit(1)
  }

  const bundler = config.build?.bundler ?? 'vite'
  const target = flags.target ?? config.build?.target ?? 'universal'

  if (bundler === 'vite') {
    await runVite(target)
  } else if (bundler === 'rolldown') {
    runRolldown(target)
  } else {
    process.stderr.write(
      `Unknown bundler "${bundler}" in aihu.config.ts build.bundler.\n` +
        'Supported values: "vite" | "rolldown"\n',
    )
    process.exit(1)
  }
}
