/**
 * skills/aihu/check-samples.ts — compile-verify every code sample in the skill.
 *
 * Contract:
 *   - every ```aihu fence in skills/aihu/**\/*.md MUST compile (exit 0)
 *   - every ```aihu-error fence MUST fail to compile (exit != 0) — these are
 *     the deliberate wrong-code teaching samples
 *
 * A skill that teaches syntax that does not compile is worse than no skill;
 * this script is the mechanical gate that keeps the skill honest against the
 * compiler in this checkout.
 *
 * Compiler resolution: $AIHU_COMPILE_BIN, else <repo>/target/release/aihu-compile,
 * else <repo>/target/debug/aihu-compile. (The published napi addon may be a
 * stale compiler generation — this script only trusts a binary built from
 * source. Build one: cargo build --release -p aihu-compiler --bin aihu-compile)
 *
 * Run: bun skills/aihu/check-samples.ts
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const skillDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(skillDir, '..', '..')

const bin =
  process.env.AIHU_COMPILE_BIN ??
  [
    join(repoRoot, 'target', 'release', 'aihu-compile'),
    join(repoRoot, 'target', 'debug', 'aihu-compile'),
  ].find((p) => existsSync(p))

if (!bin || !existsSync(bin)) {
  console.error(
    'ERROR: no aihu-compile binary. Set AIHU_COMPILE_BIN or run: cargo build --release -p aihu-compiler --bin aihu-compile',
  )
  process.exit(1)
}

/** Recursively collect .md files under a directory. */
function mdFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...mdFiles(p))
    else if (name.endsWith('.md')) out.push(p)
  }
  return out
}

/** Extract fenced blocks whose info string starts with `lang`. Supports an
 *  optional `path=...` attribute (e.g. ```aihu path=src/pages/index.aihu). */
function fences(src: string, lang: string): { code: string; path: string; line: number }[] {
  const out: { code: string; path: string; line: number }[] = []
  const lines = src.split('\n')
  let i = 0
  while (i < lines.length) {
    const m = lines[i].match(/^```(\S+)(?:\s+path=(\S+))?\s*$/)
    if (m && m[1] === lang) {
      const start = i + 1
      let j = start
      while (j < lines.length && !lines[j].startsWith('```')) j++
      out.push({
        code: lines.slice(start, j).join('\n'),
        path: m[2] ?? 'src/components/skill-sample.aihu',
        line: start + 1,
      })
      i = j + 1
    } else {
      i++
    }
  }
  return out
}

function compile(code: string, virtualPath: string): { ok: boolean; stderr: string } {
  const stem = virtualPath
    .split('/')
    .pop()!
    .replace(/\.aihu$/, '')
  const tag = stem.includes('-') ? stem : `${stem}-el`
  const r = spawnSync(bin!, ['--stdin', '--tag', tag, '--path', virtualPath], {
    input: code,
    encoding: 'utf8',
  })
  return { ok: r.status === 0, stderr: r.stderr ?? '' }
}

let pass = 0
let fail = 0

for (const file of mdFiles(skillDir)) {
  const src = readFileSync(file, 'utf8')
  const rel = file.slice(repoRoot.length + 1)

  for (const f of fences(src, 'aihu')) {
    const r = compile(f.code, f.path)
    if (r.ok) {
      console.log(`PASS  ${rel}:${f.line} (compiles)`)
      pass++
    } else {
      console.error(`FAIL  ${rel}:${f.line} — sample marked \`\`\`aihu does NOT compile:`)
      console.error(r.stderr.split('\n').slice(0, 6).join('\n'))
      fail++
    }
  }

  for (const f of fences(src, 'aihu-error')) {
    const r = compile(f.code, f.path)
    if (!r.ok) {
      console.log(`PASS  ${rel}:${f.line} (errors as documented)`)
      pass++
    } else {
      console.error(
        `FAIL  ${rel}:${f.line} — sample marked \`\`\`aihu-error unexpectedly COMPILES; the documented error is stale`,
      )
      fail++
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed (compiler: ${bin})`)
process.exit(fail > 0 ? 1 : 0)
