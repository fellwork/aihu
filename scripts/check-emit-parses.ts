#!/usr/bin/env bun
/**
 * check:emit-parses — assert every fixture component compiles to VALID JS.
 *
 * The compiler test suites assert that emitted output *contains* expected
 * substrings. Nothing asserted that the output parses. That gap let five
 * separate invalid-output bugs ship simultaneously — including one on
 * `cookbook/agent-weather.aihu`, a documented exemplar for the agent feature:
 *
 *   - async `$action` handlers  → `function name(async ())`
 *   - block-bodied `$computed`  → `computed(() => if (x) return y)`
 *   - block-bodied `$resource`  → same, plus a dropped `async`
 *   - `$form`                   → leaked into the body as `let value: () => value,`
 *   - destructured `$each`      → `([name) => name`
 *
 * Every one produced output that parsed as nothing while the compiler reported
 * success. This script compiles each fixture and parses the result; a single
 * run caught all five.
 *
 * Two failure stages are reported separately:
 *   `compile` — the .aihu itself no longer compiles (stale v1 syntax)
 *   `parse`   — it compiled, but the emitted JS is not valid
 *
 * NOT yet wired into CI: 16 fixtures still fail (11 stale-syntax examples, 5
 * emitted-JS bugs including assignment-to-const in `$action` bodies that write
 * a `$prop`). Wire it into `plan-a.yml` once those are resolved — see TODOS.md.
 * Run manually: `bun run check:emit-parses`
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { Glob } from 'bun'

const ROOT = join(import.meta.dir, '..')

/**
 * Resolve the compiler binary, preferring the NEWEST build.
 *
 * Deliberately not the Vite plugin's fixed precedence (bin → release → debug):
 * that order silently picks a stale `target/release` over a fresh
 * `target/debug`, which made this script report already-fixed bugs as live.
 * A checker that reads a stale artifact is worse than no checker.
 */
function resolveCompiler(): string {
  const candidates = [
    join(ROOT, 'packages/compiler/bin/aihu-compile'),
    join(ROOT, 'target/release/aihu-compile'),
    join(ROOT, 'target/debug/aihu-compile'),
  ].filter((c) => existsSync(c))
  if (candidates.length > 0) {
    return candidates.reduce((newest, c) =>
      statSync(c).mtimeMs > statSync(newest).mtimeMs ? c : newest,
    )
  }
  console.error(
    'check:emit-parses — no aihu-compile binary found. Run `cargo build --release` first.\nLooked in:\n  ' +
      candidates.join('\n  '),
  )
  process.exit(1)
}

const compiler = resolveCompiler()

// Bun's built-in transpiler, not esbuild: esbuild is only a transitive dep here
// (via vite), and its platform-binary path differs between bun's .bun store and
// a CI npm install. Bun.Transpiler needs no dependency and no path resolution,
// and it throws on exactly the syntax errors this guards against — verified
// against all five shapes it was written for.
const transpiler = new Bun.Transpiler({ loader: 'ts' })

const files: string[] = []
for (const pattern of ['cookbook/*.aihu', 'examples/**/*.aihu']) {
  for (const m of new Glob(pattern).scanSync(ROOT)) files.push(m)
}
files.sort()

if (files.length === 0) {
  console.error('check:emit-parses — no .aihu fixtures found; refusing to pass vacuously.')
  process.exit(1)
}

const failures: Array<{ file: string; stage: string; detail: string }> = []

for (const rel of files) {
  const abs = join(ROOT, rel)
  const tag = basename(rel, '.aihu')
  const source = readFileSync(abs, 'utf8')

  let emitted: string
  try {
    emitted = execFileSync(compiler, ['--stdin', '--tag', tag, '--path', abs], {
      input: source,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch (e) {
    const err = e as { stderr?: string; message: string }
    failures.push({ file: rel, stage: 'compile', detail: (err.stderr || err.message).trim() })
    continue
  }

  // The compiler emits TypeScript, so parse with the ts loader — the same
  // shape the Vite plugin hands to transformWithEsbuild.
  try {
    transpiler.transformSync(emitted)
  } catch (e) {
    const err = e as { message: string }
    failures.push({ file: rel, stage: 'parse', detail: err.message.trim() })
  }
}

if (failures.length > 0) {
  console.error(`\ncheck:emit-parses — ${failures.length}/${files.length} component(s) emit invalid JS:\n`)
  for (const f of failures) {
    console.error(`── ${f.file}  (${f.stage})`)
    console.error(`${f.detail}\n`)
  }
  process.exit(1)
}

console.log(`check:emit-parses — ${files.length} components emit parseable JS.`)
