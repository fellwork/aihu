/**
 * Allowlist static-file resolution for the throwaway servers in `scripts/`.
 *
 * `req.url` is network-provided, so composing a filesystem path out of it is
 * CodeQL js/path-injection (`error` severity) — and not purely theoretical:
 * `server.listen(PORT, cb)` binds `::`, i.e. every interface, not loopback.
 * A `join()` + `startsWith(root)` filter does hold against traversal, but it
 * still hands a request-derived string to `fs` and only *rejects* the bad
 * ones; get the check subtly wrong once and the escape is live.
 *
 * These two functions remove the flow instead of filtering it. `indexDir`
 * walks the build output ONCE and records the files that exist;
 * `resolveFromIndex` turns a URL path into a MAP KEY and nothing else. Every
 * path a caller can obtain is one `indexDir` itself read out of the root, so
 * nothing outside the root is reachable by construction — there is no traversal
 * to defeat, encoded or otherwise.
 */
import { readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

/**
 * Walk `dir` and index every regular file under it as
 * `<path relative to root, '/'-joined> -> <absolute path>`.
 *
 * Symlinks are skipped, not followed: `Dirent.isFile()` is false for a symlink
 * even when its target is a regular file, so a symlink dropped into the build
 * output cannot become a way out of `root`.
 */
export async function indexDir(
  root: string,
  dir: string = root,
  into: Map<string, string> = new Map(),
): Promise<Map<string, string>> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) await indexDir(root, abs, into)
    else if (entry.isFile()) into.set(relative(root, abs).split(sep).join('/'), abs)
  }
  return into
}

/**
 * Static-host resolution over the index: exact hit, then directory index, then
 * extensionless `.html` — `/guides` → `guides/index.html`.
 *
 * Returns `null` for anything not in the index, including malformed
 * percent-encoding. `decodeURIComponent('%')` throws URIError, and in the
 * original inline version that throw escaped an `async` request handler,
 * rejecting a promise nobody awaits — node's default unhandled-rejection mode
 * then kills the process, so a single `GET /%` from anywhere on the network
 * aborted the run.
 */
export function resolveFromIndex(
  files: ReadonlyMap<string, string>,
  urlPath: string,
): string | null {
  let p: string
  try {
    p = decodeURIComponent(urlPath.split('?')[0] ?? '')
  } catch {
    return null
  }
  p = p.replace(/^\/+/, '')
  if (p.endsWith('/')) p = p.slice(0, -1)
  if (p === '') return files.get('index.html') ?? null
  return files.get(p) ?? files.get(`${p}/index.html`) ?? files.get(`${p}.html`) ?? null
}
