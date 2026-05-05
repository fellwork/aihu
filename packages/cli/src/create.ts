#!/usr/bin/env node

/**
 * `create-aihu` — interactive project scaffolder for `npx create-aihu@latest`.
 *
 * Usage:
 *   npx create-aihu@latest [project-name]
 *   bun create aihu [project-name]
 *
 * Features (SOTA npx create pattern):
 *   - Auto-detects available package managers (bun > pnpm > yarn > npm)
 *   - Interactive prompts via Node readline (zero extra dependencies)
 *   - Template variants: minimal | full | docs
 *   - Optional git init
 *   - Prints exact next steps with detected PM
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'
import type { AppTemplate, PkgManager } from './index.js'
import { scaffoldApp } from './index.js'

// ─── Colour helpers (no deps) ────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  purple: '\x1b[35m',
}

function bold(s: string): string {
  return `${c.bold}${s}${c.reset}`
}
function dim(s: string): string {
  return `${c.dim}${s}${c.reset}`
}
function green(s: string): string {
  return `${c.green}${s}${c.reset}`
}
function cyan(s: string): string {
  return `${c.cyan}${s}${c.reset}`
}
function yellow(s: string): string {
  return `${c.yellow}${s}${c.reset}`
}
function purple(s: string): string {
  return `${c.purple}${s}${c.reset}`
}

// ─── Package manager detection ───────────────────────────────────────────────

/** Check if a program exists by running `pm --version` via spawnSync (no shell). */
function pmExists(pm: string): boolean {
  const r = spawnSync(pm, ['--version'], { stdio: 'ignore', shell: false })
  return r.status === 0
}

function detectPm(): PkgManager {
  for (const pm of ['bun', 'pnpm', 'yarn', 'npm'] as const) {
    if (pmExists(pm)) return pm
  }
  return 'npm'
}

// ─── Readline prompt helper ───────────────────────────────────────────────────

function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((res) => rl.question(question, res))
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  process.stdout.write('\n')
  process.stdout.write(`${purple(bold('◆'))} ${bold('Create Aihu App')}\n`)
  process.stdout.write(`${dim('  Web Components, reactive.')}\n\n`)

  // ── Project name ──────────────────────────────────────────────────────────
  const nameArg = process.argv[2]
  let projectName: string
  if (nameArg && nameArg !== '.') {
    projectName = nameArg
    process.stdout.write(`${dim('  Project name:')} ${cyan(projectName)}\n`)
  } else {
    const answer = await prompt(rl, `${dim('  Project name:')} `)
    projectName = answer.trim() || 'my-aihu-app'
  }

  const targetDir = resolve(process.cwd(), projectName)

  if (existsSync(targetDir)) {
    const overwrite = await prompt(
      rl,
      `${yellow('  !')} Directory ${bold(projectName)} already exists. Overwrite? ${dim('[y/N]')} `,
    )
    if (!overwrite.trim().toLowerCase().startsWith('y')) {
      rl.close()
      process.stdout.write(dim('  Aborted.\n\n'))
      process.exit(0)
    }
  }

  // ── Template ──────────────────────────────────────────────────────────────
  process.stdout.write('\n')
  process.stdout.write(`${dim('  Select template:')}\n`)
  process.stdout.write(`    ${cyan('1)')} minimal  — signals + arbor, single SFC\n`)
  process.stdout.write(`    ${cyan('2)')} full     — signals, arbor, router, server\n`)
  process.stdout.write(`    ${cyan('3)')} docs     — interactive docs site\n`)
  const templateAnswer = await prompt(rl, `  ${dim('Template [1]:')} `)
  const templateMap: Record<string, AppTemplate> = {
    '': 'minimal',
    '1': 'minimal',
    minimal: 'minimal',
    '2': 'full',
    full: 'full',
    '3': 'docs',
    docs: 'docs',
  }
  const template: AppTemplate = templateMap[templateAnswer.trim().toLowerCase()] ?? 'minimal'

  // ── Package manager ───────────────────────────────────────────────────────
  const detected = detectPm()
  process.stdout.write('\n')
  process.stdout.write(`${dim('  Package manager:')}\n`)
  process.stdout.write(`    ${cyan('1)')} bun   ${detected === 'bun' ? dim('(detected)') : ''}\n`)
  process.stdout.write(`    ${cyan('2)')} pnpm  ${detected === 'pnpm' ? dim('(detected)') : ''}\n`)
  process.stdout.write(`    ${cyan('3)')} yarn  ${detected === 'yarn' ? dim('(detected)') : ''}\n`)
  process.stdout.write(`    ${cyan('4)')} npm   ${detected === 'npm' ? dim('(detected)') : ''}\n`)
  const pmAnswer = await prompt(rl, `  ${dim(`Package manager [${detected}]:`)} `)
  const pmMap: Record<string, PkgManager> = {
    '': detected,
    '1': 'bun',
    bun: 'bun',
    '2': 'pnpm',
    pnpm: 'pnpm',
    '3': 'yarn',
    yarn: 'yarn',
    '4': 'npm',
    npm: 'npm',
  }
  const pm: PkgManager = pmMap[pmAnswer.trim().toLowerCase()] ?? detected

  // ── Git init ──────────────────────────────────────────────────────────────
  const gitAnswer = await prompt(rl, `\n  Initialize git repo? ${dim('[Y/n]')} `)
  const initGit = !gitAnswer.trim().toLowerCase().startsWith('n')

  rl.close()

  // ── Scaffold ──────────────────────────────────────────────────────────────
  process.stdout.write('\n')
  process.stdout.write(
    `${dim('  Creating')} ${cyan(projectName)} ${dim(`(${template} / ${pm})…`)}\n\n`,
  )

  const result = scaffoldApp(projectName, process.cwd(), { pm, template })

  for (const f of result.created) process.stdout.write(`  ${green('+')} ${f}\n`)
  for (const f of result.skipped)
    process.stdout.write(`  ${yellow('·')} ${f} ${dim('(skipped)')}\n`)

  // ── Git ───────────────────────────────────────────────────────────────────
  if (initGit) {
    spawnSync('git', ['init', targetDir], { stdio: 'ignore', shell: false })
    spawnSync('git', ['-C', targetDir, 'add', '-A'], { stdio: 'ignore', shell: false })
    spawnSync('git', ['-C', targetDir, 'commit', '-m', 'chore: initial aihu scaffold'], {
      stdio: 'ignore',
      shell: false,
    })
    process.stdout.write(`\n  ${green('✓')} git init\n`)
  }

  // ── Next steps ────────────────────────────────────────────────────────────
  const installCmd: Record<PkgManager, string> = {
    bun: 'bun install',
    pnpm: 'pnpm install',
    npm: 'npm install',
    yarn: 'yarn',
  }
  const devCmd: Record<PkgManager, string> = {
    bun: 'bun run dev',
    pnpm: 'pnpm dev',
    npm: 'npm run dev',
    yarn: 'yarn dev',
  }

  process.stdout.write(`\n  ${green(bold('✓'))} Done!\n\n`)
  process.stdout.write(`  Next steps:\n\n`)
  process.stdout.write(`    ${cyan(`cd ${projectName}`)}\n`)
  process.stdout.write(`    ${cyan(installCmd[pm])}\n`)
  process.stdout.write(`    ${cyan(devCmd[pm])}\n`)
  process.stdout.write('\n')
  process.stdout.write(`  ${dim('Docs:')} https://github.com/fellwork/aihu\n\n`)
}

main().catch((err: unknown) => {
  process.stderr.write(`\n  ${c.red}error${c.reset} ${String(err)}\n\n`)
  process.exit(1)
})
