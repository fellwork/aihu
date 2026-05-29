#!/usr/bin/env bun
/**
 * @aihu/ui registry index generator (Plan 5 Task 4 — INDEX-ONLY, R3).
 *
 * Scans `registry/<name>/` directories, reads each `meta.json` fragment +
 * the list of file PATHS, and emits a deterministic top-level `registry.json`
 * = `{ items: RegistryItem[] }`.
 *
 * INDEX-ONLY (R3): each emitted `RegistryFile` carries `path` but NOT `source`.
 * `aihu add` reads the actual `.aihu` files directly from the installed package
 * at copy time — the `.aihu` files stay the single source of truth (no inlined
 * duplication, no regen-drift hazard). `RegistryFile.source` stays in the §9.5
 * type for the reserved hosted-registry path (v2), but the v1 local generator
 * leaves it unset.
 *
 * Determinism: items are alpha-sorted by name and each item's files are
 * alpha-sorted by path, so re-running over an unchanged `registry/` yields a
 * byte-identical artifact. Idempotent.
 *
 * A recipe directory's `meta.json` fragment carries the catalog metadata:
 *   {
 *     "name": "button",
 *     "type": "ui",
 *     "description": "...",
 *     "dependencies": ["@aihu/primitives"],   // npm deps (R5), optional
 *     "registryDependencies": [],              // other recipes, optional
 *     "variants": { "variant": [...], "size": [...] },  // optional
 *     "meta": { ... }                          // optional free-form
 *   }
 * The file list is DISCOVERED by scanning the directory (every file except
 * `meta.json`); each file's `RegistryFile.type` is inferred from its extension.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, posix, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import type {
  Registry,
  RegistryFile,
  RegistryItem,
  RegistryItemType,
  VariantMap,
} from '../src/schema.ts'

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** The `meta.json` fragment shape authored per recipe directory. */
interface MetaFragment {
  name: string
  type: RegistryItemType
  description?: string
  dependencies?: string[]
  registryDependencies?: string[]
  variants?: VariantMap
  meta?: Record<string, unknown>
}

/** Map a file extension to its `RegistryFile.type` role. */
function fileRole(path: string): RegistryFile['type'] {
  if (path.endsWith('.aihu')) return 'component'
  if (path.endsWith('.css')) return 'style'
  if (path.endsWith('.ts') || path.endsWith('.js')) return 'lib'
  return 'component'
}

/**
 * Build the catalog `RegistryItem` for a single recipe directory.
 * `registryRoot` is the absolute path to the `registry/` dir; `recipeDirName`
 * the `<name>/` under it. Emitted file paths are relative to the package root
 * (the parent of `registryRoot`), e.g. `registry/button/button.aihu`.
 */
function buildItem(registryRoot: string, recipeDirName: string): RegistryItem {
  const packageRoot = dirname(registryRoot)
  const recipeDir = join(registryRoot, recipeDirName)
  const metaPath = join(recipeDir, 'meta.json')
  if (!existsSync(metaPath)) {
    throw new Error(
      `@aihu/ui gen-registry: registry/${recipeDirName}/meta.json is missing — every recipe directory needs a meta.json fragment.`,
    )
  }

  const fragment = JSON.parse(readFileSync(metaPath, 'utf8')) as MetaFragment
  if (!fragment.name || !fragment.type) {
    throw new Error(
      `@aihu/ui gen-registry: registry/${recipeDirName}/meta.json must declare both "name" and "type".`,
    )
  }

  // Discover the recipe's files (everything except meta.json), paths relative
  // to the package root, posix-normalized for cross-platform stable output.
  const files: RegistryFile[] = readdirSync(recipeDir)
    .filter((entry) => entry !== 'meta.json')
    .filter((entry) => statSync(join(recipeDir, entry)).isFile())
    .map((entry) => {
      const rel = relative(packageRoot, join(recipeDir, entry)).split(sep).join(posix.sep)
      // INDEX-ONLY (R3): `path` set, `source` UNSET.
      return { path: rel, type: fileRole(rel) }
    })
    .sort((a, b) => a.path.localeCompare(b.path))

  const item: RegistryItem = {
    name: fragment.name,
    type: fragment.type,
    files,
  }
  if (fragment.description !== undefined) item.description = fragment.description
  if (fragment.dependencies !== undefined) item.dependencies = fragment.dependencies
  if (fragment.registryDependencies !== undefined)
    item.registryDependencies = fragment.registryDependencies
  if (fragment.variants !== undefined) item.variants = fragment.variants
  if (fragment.meta !== undefined) item.meta = fragment.meta
  return item
}

/** Scan `registryRoot` for recipe directories and build the index. */
export function generateRegistry(registryRoot: string): Registry {
  if (!existsSync(registryRoot)) {
    return { items: [] }
  }
  const items = readdirSync(registryRoot)
    .filter((entry) => statSync(join(registryRoot, entry)).isDirectory())
    .map((dir) => buildItem(registryRoot, dir))
    .sort((a, b) => a.name.localeCompare(b.name))
  return { items }
}

/** Serialize the index deterministically (2-space, trailing newline). */
export function serializeRegistry(registry: Registry): string {
  return `${JSON.stringify(registry, null, 2)}\n`
}

/** Generate `registry.json` from `registry/**` and write it to the package root. */
export function writeRegistry(registryRoot = join(PACKAGE_ROOT, 'registry')): string {
  const registry = generateRegistry(registryRoot)
  const out = serializeRegistry(registry)
  const target = join(PACKAGE_ROOT, 'registry.json')
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, out)
  return out
}

// Run when invoked directly (`bun scripts/gen-registry.ts`). Portable
// direct-invocation guard (matches scripts/check-size-rows.ts), typechecks
// without Bun's `import.meta.main` lib augmentation.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  writeRegistry()
  // eslint-disable-next-line no-console
  console.log('@aihu/ui: wrote registry.json')
}
