/**
 * Post-build property mangler for @scribe/signals.
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
 * Remove this script once rolldown wires mangle.properties — replace with:
 *   output: { minify: { mangle: { properties: { regex: /^(flags|subsHead|...)$/ } } } }
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const distPath = resolve(here, '../dist/index.js')

let code = readFileSync(distPath, 'utf8')

const replacements = [
  // recomputeIfNeeded first — longest name, highest per-occurrence savings
  [/\.recomputeIfNeeded\b/g, '.ri'],
  [/\brecomputeIfNeeded\b/g, 'ri'],   // shorthand method: ,recomputeIfNeeded(

  // K1c+ Computed instance fields and prototype method (Phase 3 §3.1, §3.4)
  [/\.hasEffectSub\b/g, '.he'],
  [/\bhasEffectSub\b/g, 'he'],
  [/\.hasCached\b/g, '.hc'],
  [/\bhasCached\b/g, 'hc'],
  [/\.recompute\b/g, '.rc'],
  [/\brecompute\b/g, 'rc'],          // method shorthand: ,recompute(
  [/\.cached\b/g, '.ca'],
  [/\bcached\b/g, 'ca'],
  [/\.equals\b/g, '.eq'],
  [/\bequals\b/g, 'eq'],

  // 8-char graph fields
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
  [/\bnotify\b/g, 'no'],              // shorthand method: ,notify(

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
  [/\bsubsHead(?=[=;,}])/g, 'sh'],
  [/\bsubsTail(?=[=;,}])/g, 'st'],
  [/\bdepsHead(?=[=;,}])/g, 'dh'],
  [/\bdepsTail(?=[=;,}])/g, 'dt'],
  [/\blastWave(?=[=;,}])/g, 'lw'],
  [/\bflags(?=[=;,}])/g, 'fl'],
  [/\bfn(?=[=;,}])/g, 'f'],
]

for (const [regex, replacement] of replacements) {
  code = code.replace(regex, replacement)
}

writeFileSync(distPath, code, 'utf8')
console.log('mangle-dist: property mangling applied to dist/index.js')
