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
