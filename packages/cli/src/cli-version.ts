/**
 * @aihu/cli's own version, resolved once.
 *
 * Read from `package.json` at BUILD time (`with { type: 'json' }`), not at
 * runtime. Both properties matter:
 *
 *   - Runtime `readFileSync('../package.json')` has to guess where the file is
 *     relative to the executing module, and that answer differs between
 *     `src/bin.ts` (dev), `dist/bin.js` (built) and a `bunx`/`npx` cache
 *     extraction. It also cannot use `import.meta.resolve('@aihu/cli/package.json')`:
 *     this package's `exports` map deliberately does not expose that subpath,
 *     so the resolver throws ERR_PACKAGE_PATH_NOT_EXPORTED (create-aihu's
 *     `bin.mjs` documents hitting exactly that wall from the outside).
 *   - The bundler inlines the literal, so `aihu --version` costs no I/O and
 *     cannot report a version that disagrees with the package it shipped in.
 *
 * `src/` and `dist/` are both exactly one directory below the package root, so
 * the specifier is correct in dev and after build without a conditional.
 */

import pkg from '../package.json' with { type: 'json' }

/** The running `@aihu/cli`'s semver version, e.g. `1.2.0`. */
export const CLI_VERSION: string = pkg.version
