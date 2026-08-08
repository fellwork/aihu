/**
 * Shared argv positional-parsing for the two scaffolder entry points.
 *
 * `create-aihu` got this right (`parseProjectName`); `aihu app` did not. It
 * read `process.argv`'s first tail token, so `aihu app --pm pnpm` scaffolded a
 * complete project into a directory literally named `--pm` and exited 0 — the
 * same silent-success failure class as the `--template` fallback. One
 * implementation, used by both, is the fix that stays fixed.
 */

/**
 * Flags whose NEXT argv token is their value, and therefore is not a
 * positional. `--flag=value` needs no entry here: the value never becomes a
 * separate token.
 */
export const VALUE_FLAGS: ReadonlySet<string> = new Set([
  '--template',
  '--pm',
  '--css',
  '--shadow',
  '--options-json',
])

/** The package managers `--pm` accepts, in the order the help text lists them. */
export const PKG_MANAGERS = ['bun', 'pnpm', 'npm', 'yarn'] as const

/** For error messages: `bun | pnpm | npm | yarn`. */
export const PKG_MANAGERS_HINT = PKG_MANAGERS.join(' | ')

/**
 * What `--pm` resolved to. Modelled on `create.ts`'s `classifyTemplateArg`,
 * for the same reason: "flag absent" and "flag present with a value we cannot
 * use" are different situations and only one of them has a sane default.
 */
export type PmFlag =
  | { readonly kind: 'absent' }
  /** `--pm` as the last token, or immediately followed by another flag. */
  | { readonly kind: 'missing' }
  | { readonly kind: 'value'; readonly pm: (typeof PKG_MANAGERS)[number] }
  | { readonly kind: 'unknown'; readonly raw: string }

/**
 * Classify `--pm <v>` / `--pm=<v>` out of an argv tail.
 *
 * Both entry points used to collapse all four cases into `'bun'` (bin.ts) or
 * `undefined` (create.ts), so `--pm garbage` and a dangling `--pm` silently
 * emitted `"packageManager": "bun@…"` — which is precisely the failure
 * `resolvePmFlag`'s own docblock was written about: `pnpm install` then refuses
 * to run with `ERROR: This project is configured to use bun`. In the same
 * cleanup that wrote that docblock, `--template` grew a loud failure and
 * `--css`/`--shadow` grew stderr warnings; `--pm` — the one flag whose wrong
 * value breaks the next command the CLI prints — stayed silent.
 */
export function classifyPmFlag(args: ReadonlyArray<string>): PmFlag {
  let raw: string | undefined
  let present = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--pm') {
      present = true
      const next = args[i + 1]
      raw = next !== undefined && !next.startsWith('-') ? next : undefined
      break
    }
    if (a.startsWith('--pm=')) {
      present = true
      raw = a.slice('--pm='.length)
      break
    }
  }
  if (!present) return { kind: 'absent' }
  if (raw === undefined || raw === '') return { kind: 'missing' }
  const hit = PKG_MANAGERS.find((pm) => pm === raw)
  return hit !== undefined ? { kind: 'value', pm: hit } : { kind: 'unknown', raw }
}

/**
 * The first positional argument in `args`: skips flags AND the values of
 * value-taking flags. Returns `undefined` when there is none.
 */
export function firstPositional(
  args: ReadonlyArray<string>,
  valueFlags: ReadonlySet<string> = VALUE_FLAGS,
): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a.startsWith('-')) {
      if (valueFlags.has(a)) i++ // skip its value
      continue
    }
    return a
  }
  return undefined
}
