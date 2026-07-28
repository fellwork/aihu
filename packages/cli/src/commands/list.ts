/**
 * `aihu list [--installed]` — enumerate registry recipes (Plan 5 Task 7, spec §9.6).
 *
 * Two modes:
 *   - no flags         print EVERY `registry.json` item: name, type, description.
 *   - --installed      scan `ui.target` for copied recipes and print each one's
 *                      name + the version recorded in the `ui.primitives` record
 *                      (D-4 — record-only). Only recipes actually copied into the
 *                      target are listed.
 *
 * Resolution reuses `registry-resolve.ts` (`resolveRegistry`) so the four R6
 * error paths (no config / no registry / no `ui` field / unknown recipe) surface
 * as actionable messages + nonzero exit, identical to `aihu add`.
 *
 * The side-effect surfaces (config load, fs, target-dir scan, primitives-record
 * read, stdout/stderr) are injectable so tests run against in-memory fakes.
 */

import { existsSync, readdirSync } from 'node:fs'
import {
  destBasename,
  type RegistryFs,
  RegistryResolveError,
  type ResolveRegistryDeps,
  realRegistryFs,
  resolveRegistry,
} from '../registry-resolve.ts'

// ─── Flags ───────────────────────────────────────────────────────────────────

interface ListFlags {
  installed: boolean
}

function parseListArgs(args: ReadonlyArray<string>): ListFlags {
  return { installed: args.includes('--installed') }
}

// ─── Injectable I/O (real impl + test fakes) ─────────────────────────────────

export interface ListIo {
  /** List the basenames of files directly under `dir` (empty when absent). */
  listDir(dir: string): string[]
  stdout(s: string): void
  stderr(s: string): void
}

const realListIo: ListIo = {
  listDir: (dir) => (existsSync(dir) ? readdirSync(dir) : []),
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
}

export interface ListDeps {
  cwd?: string
  fs?: RegistryFs
  io?: ListIo
  /** Forwarded to `resolveRegistry` so tests inject a fixture config + registry. */
  resolve?: ResolveRegistryDeps
  /**
   * Read the `ui.primitives` record (D-4, record-only): recipe name → recorded
   * version (or `null` when recorded without a primitive dep). Injectable so the
   * default — which Plan 5 keeps minimal (no on-disk lockfile materialized yet) —
   * can be swapped in tests. Returns `{}` when no record exists.
   */
  readPrimitives?: (projectRoot: string) => Record<string, string | null>
  /** Throw instead of `process.exit` (tests assert without killing the runner). */
  exit?: (code: number) => never
}

// ─── Command entry ────────────────────────────────────────────────────────────

/**
 * `aihu list [--installed]` entry. Default-export async (mirrors `dev`/`build`/`add`).
 *
 * Prints to stdout; throws/exits nonzero on any R6 resolver error path.
 */
export default async function list(
  rest: ReadonlyArray<string>,
  deps: ListDeps = {},
): Promise<void> {
  const cwd = deps.cwd ?? process.cwd()
  const fs = deps.fs ?? realRegistryFs
  const io = deps.io ?? realListIo
  const readPrimitives = deps.readPrimitives ?? ((): Record<string, string | null> => ({}))
  const exit =
    deps.exit ??
    ((code: number): never => {
      process.exit(code)
    })

  const flags = parseListArgs(rest)

  // Resolve registry context. Render R6 errors actionably.
  let resolved: Awaited<ReturnType<typeof resolveRegistry>>
  try {
    resolved = await resolveRegistry(cwd, { fs, ...deps.resolve })
  } catch (err) {
    if (err instanceof RegistryResolveError) {
      io.stderr(`ERROR: ${err.message}\n`)
      return exit(1)
    }
    throw err
  }

  if (flags.installed) {
    // Scan ui.target for copied recipes; print name + recorded version (D-4).
    const present = new Set(io.listDir(resolved.targetDir))
    const versions = readPrimitives(resolved.projectRoot)
    // `aihu add` writes `<prefix>-<stem>.aihu` (the stem is the registered
    // custom-element tag, which needs the hyphen), so match on the SAME
    // derivation — `destBasename` — or `list --installed` would never
    // recognise anything `add` just wrote. The bare registry basename is
    // still accepted so a target dir populated before this change still reads.
    const prefix = resolved.ui.prefix
    const installed = resolved.registry.items.filter((item) =>
      item.files.some((f) => {
        const base = f.path.slice(f.path.lastIndexOf('/') + 1)
        return present.has(destBasename(base, prefix)) || present.has(base)
      }),
    )

    if (installed.length === 0) {
      io.stdout('No recipes installed.\n')
      return
    }

    io.stdout(`Installed recipes (${installed.length}):\n`)
    for (const item of installed) {
      const version = versions[item.name]
      const versionLabel = version == null ? '' : `  ${version}`
      io.stdout(`  ${item.name}${versionLabel}\n`)
    }
    return
  }

  // Default: print every registry item (name, type, description).
  const items = resolved.registry.items
  if (items.length === 0) {
    io.stdout('No recipes in the registry.\n')
    return
  }

  io.stdout(`Available recipes (${items.length}):\n`)
  for (const item of items) {
    const desc = item.description === undefined ? '' : `  ${item.description}`
    io.stdout(`  ${item.name}  (${item.type})${desc}\n`)
  }
}
