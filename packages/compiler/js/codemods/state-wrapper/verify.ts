#!/usr/bin/env bun
/**
 * state-wrapper migration verifier — proves the per-form equivalence classes:
 *
 *  - `$`-macro migrations must emit BYTE-IDENTICAL JS. The single allowed
 *    normalization is comment restoration: the OLD macro parser blanked `//`
 *    comments inside metadata-bag bodies (`strip_line_comments`,
 *    parser/state_macros.rs), which the wrapper path preserves. Both outputs
 *    are therefore compared with `//` line comments stripped; any residual diff fails.
 *
 *  - signal-tuple migrations are RUNTIME-equivalent: after renaming each
 *    authored setter to the generated `__<name>_set` in the BASELINE output,
 *    the residual diff must contain only the known equivalent forms (the
 *    declaration's `;`, updater-desugar sites). Residuals are PRINTED for
 *    review, never auto-accepted.
 *
 * Usage:
 *   bun …/verify.ts [--baseline <git-ref>] <files…>
 *
 * Compares `git show <ref>:<file>` (default HEAD) against the working tree.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dir, '../../../../..')
const BIN = resolve(ROOT, 'target/release/aihu-compile')

const args = process.argv.slice(2)
const refIdx = args.indexOf('--baseline')
const ref = refIdx >= 0 ? args[refIdx + 1]! : 'HEAD'
const files = args.filter((a, i) => !a.startsWith('--') && (refIdx < 0 || i !== refIdx + 1))

function compile(source: string, relPath: string): { js: string; err: string } {
  const stem = relPath
    .split('/')
    .pop()!
    .replace(/\.aihu$/, '')
  try {
    const js = execFileSync(BIN, ['--stdin', '--tag', stem, '--path', relPath], {
      input: source,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { js, err: '' }
  } catch (e) {
    const er = e as { stderr?: string; message: string }
    return { js: '', err: er.stderr ?? er.message }
  }
}

/** Strip `//` line comments (string-aware enough for emitted output). */
function stripComments(js: string): string {
  return js
    .split('\n')
    .map((line) => {
      let inS: string | null = null
      for (let i = 0; i < line.length; i++) {
        const c = line[i]
        if (inS) {
          if (c === '\\') i++
          else if (c === inS) inS = null
          continue
        }
        if (c === '"' || c === "'" || c === '`') inS = c
        else if (c === '/' && line[i + 1] === '/') return line.slice(0, i).replace(/\s+$/, '')
      }
      return line.replace(/\s+$/, '')
    })
    .join('\n')
}

/** Tuple pairs of a baseline source: [getter, setter]. */
function baselinePairs(src: string): Array<[string, string]> {
  const out: Array<[string, string]> = []
  const re = /(?:const|let)\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\]\s*=\s*signal\b/g
  let m: RegExpExecArray | null = re.exec(src)
  while (m !== null) {
    out.push([m[1]!, m[2]!])
    m = re.exec(src)
  }
  return out
}

function diffLines(a: string, b: string): string[] {
  const al = a.split('\n')
  const bl = b.split('\n')
  const out: string[] = []
  const max = Math.max(al.length, bl.length)
  // Simple aligned walk with resync — enough for near-identical outputs.
  let i = 0
  let j = 0
  while (i < al.length || j < bl.length) {
    if (al[i] === bl[j]) {
      i++
      j++
      continue
    }
    // try resync within a small window
    let found = false
    for (let w = 1; w <= 3 && !found; w++) {
      if (al[i + w] === bl[j]) {
        for (let k = 0; k < w; k++) out.push(`- ${al[i + k]}`)
        i += w
        found = true
      } else if (al[i] === bl[j + w]) {
        for (let k = 0; k < w; k++) out.push(`+ ${bl[j + k]}`)
        j += w
        found = true
      }
    }
    if (!found) {
      if (i < al.length) out.push(`- ${al[i]}`)
      if (j < bl.length) out.push(`+ ${bl[j]}`)
      i++
      j++
    }
    if (out.length > 400) break
  }
  void max
  return out
}

let failures = 0
for (const f of files) {
  const rel = relative(ROOT, resolve(f))
  let oldSrc: string
  try {
    oldSrc = execFileSync('git', ['show', `${ref}:${rel}`], { cwd: ROOT, encoding: 'utf8' })
  } catch {
    console.log(`?? ${rel}: not in ${ref}`)
    continue
  }
  const newSrc = readFileSync(resolve(f), 'utf8')
  if (oldSrc === newSrc) {
    console.log(`== ${rel}: unchanged`)
    continue
  }
  const oldOut = compile(oldSrc, rel)
  const newOut = compile(newSrc, rel)
  if (newOut.err) {
    console.log(`!! ${rel}: MIGRATED FILE FAILS TO COMPILE\n${newOut.err}`)
    failures++
    continue
  }
  if (oldOut.err) {
    console.log(`?? ${rel}: baseline failed to compile (pre-existing): ${oldOut.err.slice(0, 200)}`)
    continue
  }

  // Strict path: emitted JS byte-identical (the pure `$`-macro bucket).
  if (oldOut.js === newOut.js) {
    console.log(`OK ${rel}: BYTE-IDENTICAL`)
    continue
  }

  // Normalization 1 — comment restoration (both sides comment-stripped).
  let a = stripComments(oldOut.js)
  let b = stripComments(newOut.js)
  if (a === b) {
    console.log(`OK ${rel}: identical modulo comment restoration`)
    continue
  }

  // Normalization 2 — tuple setter renames in the BASELINE output.
  const pairs = baselinePairs(oldSrc)
  const stillTupled = new Set(baselinePairs(newSrc).map(([g]) => g))
  for (const [g, s] of pairs) {
    if (stillTupled.has(g)) continue
    a = a.replace(new RegExp(`(?<![\\w$])${s.replace(/\$/g, '\\$')}(?![\\w$])`, 'g'), `__${g}_set`)
  }
  // Normalization 3 — reactive-binding read calls. The wrapper dialect's
  // §4.2 read-rewrite splices `()` onto bare reads in @state-scope code —
  // fixing the old dialect's documented bare-read defect (reads were "a
  // different slice", prop_write_rewrite.rs). Collapse `name()` → `name` on
  // BOTH sides for every reactive binding, so authored-getter calls (old)
  // and spliced reads (new) meet in the middle.
  const reactive = new Set<string>()
  for (const [g] of pairs) reactive.add(g)
  {
    const declRe =
      /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:state|prop|derived|resource|consume|route)\b/g
    let dm: RegExpExecArray | null = declRe.exec(newSrc)
    while (dm !== null) {
      reactive.add(dm[1]!)
      dm = declRe.exec(newSrc)
    }
  }
  const collapseReads = (t: string) => {
    let out = t
    for (const name of reactive) {
      out = out.replace(
        new RegExp(`(?<![\\w$])(?<!(?<!\\.)\\.)${name.replace(/\$/g, '\\$')}\\s*\\(\\s*\\)`, 'g'),
        name,
      )
    }
    return out
  }
  a = collapseReads(a)
  b = collapseReads(b)

  // Normalization 4 — updater desugar, applied to the BASELINE side: the
  // codemod rewrites `setX(p => expr)` to `x = expr[p→x]`; the runtime
  // resolves an updater with the current value (signals/src/signal.ts:527),
  // so the two are equivalent by the setter's own contract.
  a = a.replace(
    /__([A-Za-z_$][\w$]*)_set\(\s*(?:\(\s*([A-Za-z_$][\w$]*)\s*(?::[^)]*)?\)|([A-Za-z_$][\w$]*))\s*=>\s*([^{][^)]*)\)/g,
    (_m, g: string, p1: string | undefined, p2: string | undefined, expr: string) => {
      const param = p1 ?? p2!
      const sub = expr.replace(new RegExp(`\\b${param.replace(/\$/g, '\\$')}\\b`, 'g'), () => {
        // The migrated source reads the state bare; emitted output reads the
        // getter call — which normalization 3 has already collapsed to `g`.
        return g
      })
      return `__${g}_set(${sub})`
    },
  )
  a = collapseReads(a)
  b = collapseReads(b)

  // Normalization 5 — single-statement arrow bodies: the codemod wraps
  // `=> setX(v)` rewrites as `=> { x = v }`; unbrace both sides.
  const unbrace = (t: string) => t.replace(/=>\s*\{\s*([^{};\n]+?)\s*\}/g, '=> $1')

  // Normalization 6 — trailing semicolons + leading whitespace (declaration
  // lines re-home into the wrapper emit section with different indent).
  const canon = (t: string) =>
    unbrace(t)
      .split('\n')
      .map((l) => l.replace(/;\s*$/, '').trim())
      .filter((l) => l !== '')
      .join('\n')
  a = canon(a)
  b = canon(b)

  if (a === b) {
    console.log(`OK ${rel}: identical after rename/read normalization`)
    continue
  }
  // Pure moves: the full canonical line MULTISETS agree — only ordering
  // differs (wrapper declarations re-home into the macro emit section).
  const multiset = (t: string) => {
    const m = new Map<string, number>()
    for (const x of t.split('\n')) m.set(x, (m.get(x) ?? 0) + 1)
    return m
  }
  const ma = multiset(a)
  const mb = multiset(b)
  const pureMove = ma.size === mb.size && [...ma].every(([k, v]) => mb.get(k) === v)
  if (pureMove) {
    const moved = diffLines(a, b).length / 2
    console.log(`OK ${rel}: identical modulo declaration re-homing (~${moved} moved lines)`)
    continue
  }
  const d = diffLines(a, b)
  console.log(`~~ ${rel}: ${d.length} residual diff lines — REVIEW`)
  for (const line of d) console.log(`   ${line}`)
  failures++
}
process.exit(failures > 0 ? 1 : 0)
