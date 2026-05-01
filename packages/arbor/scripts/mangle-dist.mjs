/**
 * Post-build property mangler for @scribe/arbor.
 *
 * rolldown v1.0.0-rc.17's mangle.properties API is not wired through in the
 * rc.17 output config. This script applies safe post-minification property
 * renames to shave gz bytes from arbor-internal fields AND from the inlined
 * `effect()` runtime that ships in arbor's standalone bundle.
 *
 * Only @internal properties are renamed. Public API properties (kind, tag,
 * attrs, children, value, leafKind) are excluded.
 *
 * Renames applied:
 *   Arbor StructuralNode: structuralKind→sk, condition→cn, listGrow→lg, keyFn→kf
 *   Arbor ChildScope:     appendedNodes→an, disposers→ds, anchor→ac
 *   Inlined signals (R7-arbor — investigation-arbor-restructure.md §Q2):
 *     Subscriber: flags→fl, subsHead→sh, subsTail→st, depsHead→dh, depsTail→dt
 *     MergeSubscriber: lastWave→lw
 *     Link: nextSub→ns, prevSub→ps, nextDep→nd, prevDep→pd, dep→d, sub→s, fn→f
 *     Methods/fields: notify→no, recomputeIfNeeded→ri, recompute→rc
 *     K1c+ Computed: hasEffectSub→he, hasCached→hc, cached→ca, equals→eq
 *
 * Applied AFTER minification so all renames hit the single-char parameter
 * forms (e.g. condition:e from the when() factory).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const distPath = resolve(here, '../dist/index.js')

let code = readFileSync(distPath, 'utf8')

const replacements = [
  // Arbor StructuralNode fields (longer names first to avoid partial matches)
  [/\.structuralKind\b/g, '.sk'],
  [/structuralKind:/g, 'sk:'],
  [/\.listGrow\b/g, '.lg'],
  [/listGrow:/g, 'lg:'],
  [/\.keyFn\b/g, '.kf'],
  [/keyFn:/g, 'kf:'],
  [/\.condition\b/g, '.cn'],
  [/condition:/g, 'cn:'],
  // Arbor ChildScope fields
  [/\.appendedNodes\b/g, '.an'],
  [/appendedNodes:/g, 'an:'],
  [/\.disposers\b/g, '.ds'],
  [/disposers:/g, 'ds:'],
  // anchor: must come after appendedNodes to avoid false matches
  [/\.anchor\b/g, '.ac'],
  [/anchor:/g, 'ac:'],

  // ─────── Inlined signals runtime (R7-arbor parity with signals mangler) ───────
  //
  // Mirrors packages/signals/scripts/mangle-dist.mjs:39-83. These names
  // appear in arbor's bundle because @scribe/arbor inlines @scribe/signals's
  // `effect()` for the standalone-package UX. signals's own mangler runs
  // on signals's dist; arbor must mangle a copy.

  // recomputeIfNeeded first — longest name, highest per-occurrence savings
  [/\.recomputeIfNeeded\b/g, '.ri'],
  [/\brecomputeIfNeeded\b/g, 'ri'],   // shorthand method: ,recomputeIfNeeded(

  // K1c+ Computed instance fields and prototype method
  [/\.hasEffectSub\b/g, '.he'],
  [/\bhasEffectSub\b/g, 'he'],
  [/\.hasCached\b/g, '.hc'],
  [/\bhasCached\b/g, 'hc'],
  [/\.recompute\b/g, '.rc'],
  [/\brecompute\b/g, 'rc'],
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

  // Class-body field declarations (parity with signals mangler — K1c+
  // Computed/Effect classes inline into arbor's bundle).
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
