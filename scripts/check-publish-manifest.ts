#!/usr/bin/env bun
/**
 * CI lint — every publishable workspace package is in `publish-all.sh`'s manifest.
 *
 * `scripts/publish-all.sh` publishes a HAND-MAINTAINED `PKGS` array, not
 * `--workspaces`. A public package absent from that array is bumped by
 * changesets on every release, gets a CHANGELOG entry, and never reaches npm.
 * The release job stays green throughout, so the gap is invisible until a user
 * reports a 404.
 *
 * Known victims: `@aihu/ui` (#349), `@aihu/seo` (#355) and `@aihu/store`, each
 * found only after the fact — plus `@aihu/editor` (stuck unpublished at 0.1.1)
 * and `@aihu/magna` (0.2.4), both caught by this check's very first run.
 *
 * A package is publishable when `packages/<slug>/package.json` is not
 * `"private": true`. That is the same condition npm itself uses, so the check
 * cannot drift from reality: mark a package private and it is exempt, make it
 * public and it must ship.
 *
 * Exit codes:
 *   0  every publishable package is in the manifest
 *   1  a publishable package is missing (or the manifest names a package that
 *      no longer exists / has gone private)
 *   2  unexpected error (manifest unreadable, PKGS array unparseable)
 *
 * Run locally:
 *   bun run check:publish-manifest
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = join(ROOT, 'scripts', 'publish-all.sh')
const PACKAGES = join(ROOT, 'packages')

/**
 * Slugs intentionally absent from PKGS. Every entry needs a reason — an
 * undocumented exemption is how this class of gap hides.
 */
const EXEMPT = new Set<string>([
  // VS Code extension: `engines.vscode` + `publisher`, shipped to the VS Code
  // marketplace via vsce. It is not an npm artifact and must not be in an npm
  // publish list. (Not `private: true` because vsce reads the manifest.)
  'vscode-aihu',

  // UNRESOLVED — deliberately exempt pending a decision, not because it is fine.
  // `@aihu/templates-cf-team` is 3.0.1 in-repo and 1.0.0 on npm: it IS a real
  // npm package and it HAS drifted two majors behind via exactly the gap this
  // check exists to catch. It is exempt only because adding it here would
  // publish a two-major jump on a scaffolding template as a side effect of a
  // CI fix. Decide explicitly: either add "templates/cf-team" to PKGS and let
  // it ship, or set `"private": true` if templates are meant to be consumed
  // from the repo rather than npm. Then delete this exemption.
  'templates/cf-team',
])

/**
 * Parse the `PKGS=( ... )` array. Entries are double-quoted slugs relative to
 * `packages/`, optionally followed by a `#` comment.
 */
export function parseManifest(src: string): string[] {
  const m = src.match(/^PKGS=\(([\s\S]*?)^\)/m)
  if (!m) throw new Error('could not locate the PKGS=( ... ) array in publish-all.sh')
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])
}

/** Every non-private package under `packages/`, as slugs relative to that dir. */
export function discoverPublishable(packagesDir: string): { slug: string; name: string }[] {
  const found: { slug: string; name: string }[] = []

  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'node_modules') continue
      const slug = prefix ? `${prefix}/${entry.name}` : entry.name
      const abs = join(dir, entry.name)
      const manifest = join(abs, 'package.json')

      if (existsSync(manifest)) {
        const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
        if (pkg.private !== true && typeof pkg.name === 'string') {
          found.push({ slug, name: pkg.name })
        }
        // A package dir may still nest others (e.g. `_moved/`), so keep walking
        // only when this level is a grouping dir rather than a real package.
        continue
      }
      walk(abs, slug)
    }
  }

  walk(packagesDir, '')
  return found.sort((a, b) => a.slug.localeCompare(b.slug))
}

function main(): number {
  let listed: string[]
  try {
    listed = parseManifest(readFileSync(MANIFEST, 'utf8'))
  } catch (err) {
    console.error(`ERROR: ${(err as Error).message}`)
    return 2
  }

  const publishable = discoverPublishable(PACKAGES)
  const listedSet = new Set(listed)
  const publishableSlugs = new Set(publishable.map((p) => p.slug))

  const missing = publishable.filter((p) => !listedSet.has(p.slug) && !EXEMPT.has(p.slug))
  const stale = listed.filter((s) => !publishableSlugs.has(s))

  if (missing.length === 0 && stale.length === 0) {
    console.log(
      `OK: all ${publishable.length} publishable packages are in publish-all.sh's PKGS manifest.`,
    )
    return 0
  }

  if (missing.length > 0) {
    console.error('FAIL: publishable packages missing from publish-all.sh PKGS.\n')
    console.error(
      'These are bumped by changesets on every release and never published.\n' +
        'The release job stays GREEN — the only symptom is a 404 on npm.\n',
    )
    for (const p of missing) console.error(`  ${p.name}  ->  add "${p.slug}"`)
    console.error(
      '\nAdd each to the PKGS array in scripts/publish-all.sh, placed AFTER every\n' +
        '@aihu package it depends on (the array is published in order).\n' +
        'If a package genuinely should not publish, set "private": true instead.',
    )
  }

  if (stale.length > 0) {
    console.error('\nFAIL: PKGS names entries with no public package under packages/.\n')
    for (const s of stale)
      console.error(`  "${s}"  (no packages/${s}/package.json, or it is private)`)
    console.error('\nRemove them, or restore the package.')
  }

  return 1
}

if (import.meta.main) process.exit(main())
