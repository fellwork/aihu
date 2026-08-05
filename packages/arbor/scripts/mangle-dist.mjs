/**
 * Post-build property mangler for @aihu/arbor.
 *
 * rolldown v1.0.0-rc.17's mangle.properties API is not wired through in the
 * rc.17 output config. This script applies safe post-minification property
 * renames to shave gz bytes from arbor-internal fields AND from the inlined
 * `effect()` runtime that ships in arbor's standalone bundle.
 *
 * Only @internal properties are renamed. Public API properties (kind, tag,
 * attrs, children, value, leafKind) are excluded.
 *
 * WHAT COUNTS AS PUBLIC IS BROADER THAN THE EXPORT LIST. An arbor node is a
 * WIRE FORMAT: other packages receive node objects and read their fields by
 * name. Any field another package reads is public API regardless of an
 * `@internal` tag, because renaming it here silently breaks that reader —
 * silently, because the reader's `obj.someField === 'x'` simply becomes
 * `undefined === 'x'` and takes the "nothing to do" path instead of throwing.
 *
 * That is not hypothetical. `structuralKind`, `condition`, `listGrow` and
 * `keyFn` were on this list, and `@aihu/server`'s `_structuralSubtrees` reads
 * all four (ssr.ts:387-396). Against the built package every branch missed and
 * the function returned `[]` — so EVERY `each` and EVERY `if` server-rendered
 * as an empty pair of structural markers, in every SSR and SSG build, for as
 * long as this script has existed. The whole test suite passed throughout,
 * because `vitest.config.ts` aliases `@aihu/arbor` to `src/`, where the long
 * names still exist: the tests validated a shape the published package does
 * not have. `tests/dist-contract.test.ts` now imports from `dist/` for exactly
 * this reason — see the note there before adding any rename below.
 *
 * Renames applied:
 *   Arbor ChildScope:     appendedNodes→an, disposers→ds, anchor→ac, item→im, pos→p
 *     (audited: no package outside arbor reads these off an arbor object —
 *     the `disposers` hits in @aihu/runtime are comment text, and the
 *     `anchor`/`item`/`pos` hits elsewhere are unrelated objects.)
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
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(here, '../dist')

// EVERY emitted chunk, not just index.js. arbor builds two entries now
// (`.` and `./hydrate`), so rolldown hoists their shared code into a
// `mount-<hash>.js` chunk — and the code this script renames lives THERE.
// Rewriting only index.js silently stopped mangling the moment the second
// entry was added: `appendedNodes` and `disposers` came back unmangled in the
// shared chunk while index.js, now a 344 B re-export shim, matched nothing.
// Globbing the directory means adding an entry can never quietly disable this
// again.
const files = readdirSync(distDir).filter((f) => f.endsWith('.js'))

const replacements = [
  // NOTE: StructuralNode's `structuralKind` / `condition` / `listGrow` /
  // `keyFn` were renamed here and MUST NOT BE. They are read across the
  // package boundary by @aihu/server (and are part of the node wire format
  // generally) — see the header. Removing those four renames costs a handful
  // of gzipped bytes and restores server-side rendering of every `each` and
  // `if`.
  //
  // Arbor ChildScope fields
  [/\.appendedNodes\b/g, '.an'],
  [/appendedNodes:/g, 'an:'],
  [/\.disposers\b/g, '.ds'],
  [/disposers:/g, 'ds:'],
  // anchor: must come after appendedNodes to avoid false matches
  [/\.anchor\b/g, '.ac'],
  [/anchor:/g, 'ac:'],
  // FEL-408 subsequence bookkeeping. `\b` on both forms so substrings
  // (`dispose`/`pose`/`position`, `.items`, `itemscope`) can never be hit;
  // verified 1:1 against the unmangled dist (9 sites, all ChildScope).
  [/\.item\b/g, '.im'],
  [/\bitem:/g, 'im:'],
  [/\.pos\b/g, '.p'],
  [/\bpos:/g, 'p:'],

  // ─────── Inlined signals runtime (R7-arbor parity with signals mangler) ───────
  //
  // Mirrors packages/signals/scripts/mangle-dist.mjs:39-83. These names
  // appear in arbor's bundle because @aihu/arbor inlines @aihu/signals's
  // `effect()` for the standalone-package UX. signals's own mangler runs
  // on signals's dist; arbor must mangle a copy.

  // recomputeIfNeeded first — longest name, highest per-occurrence savings
  [/\.recomputeIfNeeded\b/g, '.ri'],
  [/\brecomputeIfNeeded\b/g, 'ri'], // shorthand method: ,recomputeIfNeeded(

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

for (const file of files) {
  const filePath = resolve(distDir, file)
  let code = readFileSync(filePath, 'utf8')
  for (const [regex, replacement] of replacements) {
    code = code.replace(regex, replacement)
  }
  writeFileSync(filePath, code, 'utf8')
}
console.log(`mangle-dist: property mangling applied to ${files.length} chunk(s)`)
