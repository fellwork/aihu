/**
 * Post-build property mangler for @aihu/signals.
 *
 * rolldown v1.0.0-rc.17's mangle.properties API is not wired through in the
 * output config. This script applies safe post-minification property renames
 * to the internal reactive-graph node fields, matching the same technique
 * used in packages/arbor/scripts/mangle-dist.mjs.
 *
 * Only @internal properties are renamed. Public API shapes (signal tuple
 * [getter, setter], the E symbol slot, $state .value, error .name) are
 * excluded.
 *
 * Renames applied:
 *   Node graph fields:  flags→fl, subsHead→sh, subsTail→st,
 *                       depsHead→dh, depsTail→dt, lastWave→lw
 *   Link fields:        nextSub→ns, prevSub→ps, nextDep→nd, prevDep→pd
 *   Method names:       recomputeIfNeeded→ri, notify→no, recompute→rc
 *   Computed fields (K1c+ Phase 3): cached→ca, hasCached→hc,
 *                       hasEffectSub→he, equals→eq
 *
 * Each entry is [accessPattern, definitionPattern, shortName]. Access
 * patterns use `\.name\b`; definition patterns use `name:` for data
 * properties or `\bname\b` for shorthand methods (applied after access
 * patterns so only bare occurrences remain).
 *
 * Applied AFTER rolldown minification so renames hit single-char variable
 * forms (e.g. e.flags becomes e.fl).
 *
 * CHUNK-AWARE (post lifecycle-ownership-dx multi-entry split): rolldown's
 * config now builds TWO entries (`index`, `lifecycle`) that share a common
 * `scope-<hash>.js` chunk, instead of one self-contained `dist/index.js`.
 * This script therefore mangles EVERY `dist/*.js` file with the SAME
 * replacement table, not just `index.js` — mangling only `index.js` would
 * silently desync property names the moment a mangled field lives in (or
 * moves into) the shared chunk: `index.js` would read the short form
 * (`.fl`) while the chunk still wrote the long form (`.flags`), breaking
 * the PUBLISHED package while every src-based test stayed green (no test
 * exercises the mangled dist output). Applying the same substitutions to
 * every emitted file keeps cross-chunk property access consistent by
 * construction, whichever file a given field's declaration or access ends
 * up in.
 *
 * Remove this script once rolldown wires mangle.properties — replace with:
 *   output: { minify: { mangle: { properties: { regex: /^(flags|subsHead|...)$/ } } } }
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(here, '../dist')

const replacements = [
  // recomputeIfNeeded first — longest name, highest per-occurrence savings
  [/\.recomputeIfNeeded\b/g, '.ri'],
  [/\brecomputeIfNeeded\b/g, 'ri'], // shorthand method: ,recomputeIfNeeded(

  // K1c+ Computed instance fields and prototype method (Phase 3 §3.1, §3.4)
  [/\.hasEffectSub\b/g, '.he'],
  [/\bhasEffectSub\b/g, 'he'],
  [/\.hasCached\b/g, '.hc'],
  [/\bhasCached\b/g, 'hc'],
  [/\.recompute\b/g, '.rc'],
  [/\brecompute\b/g, 'rc'], // method shorthand: ,recompute(
  [/\.cached\b/g, '.ca'],
  [/\bcached\b/g, 'ca'],
  [/\.equals\b/g, '.eq'],
  [/\bequals\b/g, 'eq'],

  // 8-char graph fields
  // cleanups — Effect per-run cleanup list (effect-scope plan §1). `cl` is
  // unused by every other rename (fl/sh/st/dh/dt/lw/ns/ps/nd/pd/ri/no/rc/
  // he/hc/ca/eq/d/s/f — verified). Access pattern here; class-body
  // declaration pattern in the class-body section below.
  [/\.cleanups\b/g, '.cl'],
  [/\.lastWave\b/g, '.lw'],
  [/lastWave:/g, 'lw:'],
  [/\.subsHead\b/g, '.sh'],
  [/subsHead:/g, 'sh:'],
  [/\.subsTail\b/g, '.st'],
  [/subsTail:/g, 'st:'],
  [/\.depsHead\b/g, '.dh'],
  [/depsHead:/g, 'dh:'],
  [/\.depsTail\b/g, '.dt'],
  [/depsTail:/g, 'dt:'],

  // 7-char link fields
  [/\.nextSub\b/g, '.ns'],
  [/nextSub:/g, 'ns:'],
  [/\.prevSub\b/g, '.ps'],
  [/prevSub:/g, 'ps:'],
  [/\.nextDep\b/g, '.nd'],
  [/nextDep:/g, 'nd:'],
  [/\.prevDep\b/g, '.pd'],
  [/prevDep:/g, 'pd:'],

  // notify — shorthand method (dot form covered above as .no after .notify)
  [/\.notify\b/g, '.no'],
  [/\bnotify\b/g, 'no'], // shorthand method: ,notify(

  // R7: 3-char Link/EffectNode field names. Only `.X` access patterns
  // and `X:` definition patterns (NOT bareword `X` — those are local
  // variables/parameters in the source: `effect(fn)`, `linkAdd(dep,sub)`).
  [/\.dep\b/g, '.d'],
  [/dep:/g, 'd:'],
  [/\.sub\b/g, '.s'],
  [/sub:/g, 's:'],
  [/\.fn\b/g, '.f'],
  [/fn:/g, 'f:'],

  // flags — highest occurrence count, process last to avoid masking others
  [/\.flags\b/g, '.fl'],
  [/flags:/g, 'fl:'],

  // ─── Class field declarations (K1c+ Phase 3) ───
  // Class-body field declarations (`flags=8;`, `subsHead=null;`, `fn;`) are
  // NOT covered by `.X` / `X:` regexes — they appear bare and end with `=`,
  // `;`, `,`, or `}`. After the access/definition patterns above run, these
  // names ONLY survive in class-body positions. Bareword regex with a
  // lookahead for class-body terminators is safe here.
  //
  // Order: longest names first to prevent prefix collisions (e.g. `subsHead`
  // before `subs`-anything else); flags last because `\bflags\b` is the
  // most aggressive bareword.
  [/\bcleanups(?=[=;,}])/g, 'cl'],
  [/\bsubsHead(?=[=;,}])/g, 'sh'],
  [/\bsubsTail(?=[=;,}])/g, 'st'],
  [/\bdepsHead(?=[=;,}])/g, 'dh'],
  [/\bdepsTail(?=[=;,}])/g, 'dt'],
  [/\blastWave(?=[=;,}])/g, 'lw'],
  [/\bflags(?=[=;,}])/g, 'fl'],
  [/\bfn(?=[=;,}])/g, 'f'],
]

// Every emitted JS file (index.js, lifecycle.js, and any shared
// `scope-<hash>.js` chunk rolldown splits out) gets the identical
// replacement table applied, in file order, so a field that lives in one
// file and is accessed from another still agrees on the short name.
const jsFiles = readdirSync(distDir)
  .filter((f) => f.endsWith('.js'))
  .sort()

for (const file of jsFiles) {
  const filePath = join(distDir, file)
  let code = readFileSync(filePath, 'utf8')
  for (const [regex, replacement] of replacements) {
    code = code.replace(regex, replacement)
  }
  writeFileSync(filePath, code, 'utf8')
}

console.log(
  `mangle-dist: property mangling applied to ${jsFiles.length} dist file(s): ${jsFiles.join(', ')}`,
)
