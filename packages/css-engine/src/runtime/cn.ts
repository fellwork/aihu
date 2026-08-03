/**
 * `@aihu/css-engine/runtime/cn` — the class-merge runtime helper (Plan 3 Task 9).
 *
 * `cn(...inputs)` merges class strings / arrays / conditionals into a single
 * deduplicated class string, resolving Tailwind-style conflicts last-wins per
 * property group (`cn('p-2', 'p-4')` → `'p-4'`).
 *
 * The conflict map (`CONFLICT_GROUPS`) is GENERATED at engine build time from
 * the utility registry (`scripts/gen-cn-conflict-map.ts` → Rust
 * `tokens::conflict_groups()`), NOT hand-maintained — so it never drifts from
 * the utility table. Separate < 1 KB gz sub-export from `runtime/progressive`
 * (Risk #4 size-split).
 *
 * This is the runtime-merge helper for consumer-provided overrides (spec §9.3):
 * recipes use static utility strings at compile time; `cn()` is only for the
 * runtime override case.
 */
import { CONFLICT_GROUPS } from './cn-conflict-map.generated.ts'

/** A class value: string, falsy (dropped), or a nested array of the same. */
export type ClassValue = string | number | null | undefined | false | ClassValue[]

/** Flatten the (possibly nested / conditional) inputs into a token list. */
function tokens(inputs: ClassValue[], out: string[]): void {
  for (const input of inputs) {
    if (!input) continue
    if (Array.isArray(input)) {
      tokens(input, out)
    } else {
      for (const t of String(input).split(' ')) {
        if (t) out.push(t)
      }
    }
  }
}

/**
 * The conflict-group key for a class, or the class itself when it belongs to no
 * known group (so unrelated classes always coexist). Strips variant prefixes
 * (`md:`, `hover:`, …) so `hover:p-2` and `hover:p-4` still conflict, while
 * `p-2` and `hover:p-4` do not (different variant scope).
 *
 * Matches `CONFLICT_GROUPS` by LONGEST dash-delimited prefix, not just the
 * first segment — `animate-delay-500` must key to the `animate-delay` entry,
 * not fall through to the broader `animate` entry `animate-fade-in` keys to
 * (that collision is the whole reason a modifier family gets its own group:
 * `cn('animate-fade-in', 'animate-delay-500')` must keep BOTH, since they set
 * different CSS properties). `CONFLICT_GROUPS` is generated sorted
 * longest-prefix-first for exactly this scan (see
 * `scripts/gen-cn-conflict-map.ts`) — dashless bases (`flex`) and any base
 * with no registered prefix at any segment length key to the class itself.
 */
function groupKey(cls: string): string {
  const colon = cls.lastIndexOf(':')
  const variant = colon === -1 ? '' : cls.slice(0, colon + 1)
  const base = colon === -1 ? cls : cls.slice(colon + 1)
  const segments = base.split('-')
  for (let i = segments.length; i > 0; i--) {
    const group = CONFLICT_GROUPS[segments.slice(0, i).join('-')]
    if (group) return `${variant}${group}`
  }
  return cls
}

/**
 * Merge class values, resolving last-wins conflicts per property group.
 *
 * @example cn('p-2', 'p-4')                  // 'p-4'
 * @example cn('a', false && 'b', ['c'])      // 'a c'
 * @example cn('bg-red-500', 'bg-blue-500')   // 'bg-blue-500'
 */
export function cn(...inputs: ClassValue[]): string {
  const flat: string[] = []
  tokens(inputs, flat)

  // Last occurrence per group key wins; preserve final order by re-scanning.
  const winner = new Map<string, string>()
  for (const t of flat) winner.set(groupKey(t), t)

  const seen = new Set<string>()
  const result: string[] = []
  for (const t of flat) {
    const key = groupKey(t)
    if (winner.get(key) === t && !seen.has(t)) {
      seen.add(t)
      result.push(t)
    }
  }
  return result.join(' ')
}
