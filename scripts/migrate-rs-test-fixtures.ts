/**
 * scripts/migrate-rs-test-fixtures.ts — one-off scoped pass for v1.0.8.
 *
 * Mirror of `scripts/migrate-rs-test-fixtures.sh`. See that file's header
 * for the rationale; this is the actual implementation.
 *
 * Loads `migrateInlineAttrs` from `packages/cli/src/commands/migrate.ts`
 * (the same source-of-truth used by `npx aihu migrate` for `.aihu` files)
 * and applies it to every raw-string block (Rust `r#"..."#` form) inside
 * `packages/compiler/tests` (every `.rs` file) that looks like it contains
 * `.aihu` content AND does NOT appear to be a rejection-test input.
 *
 * Rejection tests (e.g. `rejects_*_c30x` in macro_attrs.rs, template_parse.rs,
 * v1_rejections.rs) intentionally embed the legacy syntax to verify it
 * rejects with the correct error code. Those raw-strings MUST NOT be
 * rewritten.
 *
 * Per Builder R5.2b-2's manifest (§2 items 12-16) the rejection-test inline
 * sources were already updated during R5.2b-2. Running this script after
 * R5.2b-2 lands is expected to be a no-op; this script exists to document
 * the dogfood-completeness check for R5.2b-3 (per Investigator R5.1 GAP-1).
 *
 * Idempotent. Committed + removed in the same commit. Not preserved tooling.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrateInlineAttrs } from '../packages/cli/src/commands/migrate.ts'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = resolve(__filename, '..', '..')

const RS_GLOB = 'packages/compiler/tests/**/*.rs'

/**
 * Match Rust raw-string literals: `r#"..."#`, `r##"..."##`, etc.
 * The hash-count is preserved on both ends. We extract the inner content
 * for migration, then re-wrap.
 */
const RAW_STRING_RE = /r(#+)"([\s\S]*?)"\1/g

function looksLikeAihu(s: string): boolean {
  // Heuristic: contains @template or @state block or any lowercase HTML tag
  // with a curly-form attribute.
  return /@template\s*\{|@state\s*\{|<[a-z][\w-]*[^>]*\s[a-zA-Z][\w-]*=\{/.test(s)
}

/**
 * Detect raw-strings that are intentional legacy-form inputs to rejection
 * tests. These embed `:attr=`, `@event=` or plain `attr={…}` on lowercase
 * tags so the parser can prove it rejects with C304/C305/C306. Migrating
 * them would invalidate the test.
 *
 * Heuristic: the raw-string contains exactly one of the three legacy
 * shapes AND does NOT also contain canonical `$attr={…}` or `$on.x=`
 * forms (i.e. it's a focused rejection input, not a workspace fixture
 * that happens to use mixed syntax).
 */
function looksLikeRejectionInput(s: string): boolean {
  const hasLegacyColon = /\s:[a-zA-Z][\w-]*="/.test(s)
  const hasLegacyAt = /\s@[a-zA-Z][\w-]*="/.test(s)
  const hasPlainCurlyOnHtml = /<[a-z][\w-]*[^>]*\s[a-zA-Z][\w-]*=\{/.test(s)
  const hasCanonical = /\s\$[a-zA-Z][\w-]*=\{|\s\$on\.|\s\$bind\.|\s\$class\b/.test(s)
  // A small, focused snippet with legacy form and no canonical form is a
  // rejection-test input. Whitelist the migration to non-rejection contexts.
  if (hasCanonical) return false
  return hasLegacyColon || hasLegacyAt || hasPlainCurlyOnHtml
}

function migrateFile(filePath: string): { changed: boolean; rewrites: number } {
  const original = readFileSync(filePath, 'utf8')
  let rewrites = 0
  const rewritten = original.replace(RAW_STRING_RE, (match, hashes, body) => {
    if (!looksLikeAihu(body)) return match
    if (looksLikeRejectionInput(body)) return match
    const migrated = migrateInlineAttrs(body)
    if (migrated === body) return match
    rewrites++
    return `r${hashes}"${migrated}"${hashes}`
  })
  if (rewritten !== original) {
    writeFileSync(filePath, rewritten, 'utf8')
    return { changed: true, rewrites }
  }
  return { changed: false, rewrites: 0 }
}

const glob = new Bun.Glob(RS_GLOB)
const files: string[] = []
for (const f of glob.scanSync({ cwd: REPO_ROOT, absolute: true })) {
  files.push(f)
}
let totalChanged = 0
let totalRewrites = 0
for (const file of files) {
  const { changed, rewrites } = migrateFile(file)
  if (changed) {
    totalChanged++
    totalRewrites += rewrites
    const rel = file.replace(`${REPO_ROOT.replace(/\\/g, '/')}/`, '').replace(/\\/g, '/')
    process.stdout.write(`✓ ${rel} (${rewrites} raw-string block${rewrites === 1 ? '' : 's'})\n`)
  }
}
process.stdout.write(
  `\nDone. ${totalChanged} file${totalChanged === 1 ? '' : 's'} touched, ${totalRewrites} raw-string block${totalRewrites === 1 ? '' : 's'} rewritten.\n`,
)
