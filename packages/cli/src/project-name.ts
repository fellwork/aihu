/**
 * The one definition of "a legal name to scaffold under".
 *
 * WHY THIS MODULE EXISTS. The CLI had two disagreeing answers. The template
 * pipeline (`scaffold-pipeline.ts`'s `mergeOptions`) enforced
 * `/^[a-z][a-z0-9-]*$/` and threw on anything else; the legacy generators
 * (`scaffoldApp`, `scaffoldPlugin`) validated nothing at all and handed the raw
 * string straight to `resolve(outDir ?? '.', name)`. So
 * `aihu app ../../ESCAPED` wrote a complete project two directories ABOVE the
 * cwd and exited 0, with `"name": "../../ESCAPED"` in the emitted
 * `package.json` — not a legal npm package name, so the `npm install` the CLI
 * prints as the very next step fails on the tree it just made.
 *
 * `scaffoldPage` had already grown a `.`/`..` guard for exactly this class of
 * bug; it was never extended to its two siblings, and it split on `/` only, so
 * a Windows-style `..\..\x` segment walked straight through it (harmless on
 * POSIX, where `\` is an ordinary filename character; a real escape on Win32,
 * where `join()` treats it as a separator).
 *
 * WHAT IS ENFORCED. `/^[a-z][a-z0-9-]*$/` — the same regex `mergeOptions`
 * already used, so the two scaffold paths cannot disagree about what a legal
 * name is. It is deliberately stricter than npm's own package-name grammar
 * (no scopes, no dots, no underscores, no leading digit): the name is
 * simultaneously a directory name, an npm `name` field, and — for plugins — an
 * interpolated JS string literal in the generated `src/index.ts`, and the
 * intersection of what all three accept is roughly this.
 *
 * Rejecting is the whole point. This module never sanitises: silently renaming
 * what the author typed is the failure mode `scaffoldComponent`'s docblock
 * already argues against ("Rather than scaffold something that cannot run — or
 * silently rename what the author typed — this refuses, and says what to type
 * instead"). The suggestion below is a message, not a substitution.
 */

/** The legal-name grammar. Shared with `mergeOptions`, which predates it. */
export const PROJECT_NAME_RE = /^[a-z][a-z0-9-]*$/

/** Any path separator, either platform's. `\` is checked because `join()` on
 * Win32 treats it as one and POSIX-only splitting would let it through. */
const SEPARATOR_RE = /[/\\]/

/**
 * A best-effort legal name derived from `raw`, for the error message only.
 * Returns `undefined` when nothing usable survives (so the message does not
 * suggest the empty string).
 */
function suggest(raw: string): string | undefined {
  const kebab = raw
    // Split on case TRANSITIONS, not on every capital: `index.ts`'s `toKebab`
    // hyphenates each one, which turns `ESCAPED` into `e-s-c-a-p-e-d` — a
    // suggestion that reads as a bug. `MyForms` → `my-forms`, `ESCAPED` →
    // `escaped`. (`toKebab` itself is unchanged: it only ever sees names that
    // passed this validator, which have no capitals at all.)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^[^a-z]+/, '')
  return PROJECT_NAME_RE.test(kebab) ? kebab : undefined
}

/**
 * Throw unless `name` is a legal scaffold name.
 *
 * @param command the user-facing command, for the message (`aihu app`).
 * @param what    what the name names, for the message (`project name`).
 */
export function assertProjectName(name: string, command: string, what: string): void {
  if (PROJECT_NAME_RE.test(name)) return

  // Path traversal gets its own sentence: it is the case where proceeding does
  // not merely produce a broken project but writes outside the directory the
  // user is standing in.
  const segments = name.split(SEPARATOR_RE)
  const traversal = segments.find((s) => s === '.' || s === '..')
  const isPath = traversal !== undefined || SEPARATOR_RE.test(name)
  // Only `..` and an absolute path actually LEAVE the directory; `.` and
  // `@scope/app` are merely paths. Claiming an escape that cannot happen makes
  // the accurate message harder to believe.
  const escapes = traversal === '..' || /^[/\\]/.test(name)
  const reason = isPath
    ? `it is a path, not a name${escapes ? ` — ${command} would write outside the current directory` : ''}`
    : 'it is not a legal package name (lowercase letters, digits and hyphens only, starting with a letter)'

  const hint = suggest(name)
  throw new Error(
    `${command}: ${what} ${JSON.stringify(name)} is not usable — ${reason}. ` +
      (hint !== undefined
        ? `Use a name like '${hint}'.`
        : `Use a name matching ${PROJECT_NAME_RE.source}.`),
  )
}

/**
 * Reject a route whose segments would escape `src/pages/`.
 *
 * Split on BOTH separators (see the module docblock) but return the `/`-split
 * segments the caller builds its path from, so a legal route's on-disk layout
 * is byte-identical to before this check existed.
 */
export function assertRouteSegments(routePath: string, segments: ReadonlyArray<string>): void {
  for (const segment of segments) {
    for (const part of segment.split(SEPARATOR_RE)) {
      if (part === '.' || part === '..') {
        throw new Error(
          `aihu page: route '${routePath}' contains a '${part}' segment, which would write ` +
            'outside src/pages/. Use a route path relative to the pages root instead.',
        )
      }
    }
    if (segment.includes('\\')) {
      throw new Error(
        `aihu page: route '${routePath}' contains a backslash, which is a path separator on ` +
          'Windows and never a legal route character. Use `/` to separate route segments.',
      )
    }
  }
}
