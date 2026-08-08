/**
 * The `packageManager` field a scaffold emits, for whichever `--pm` was chosen.
 *
 * ## The bug
 *
 * Three generators (`appPackageJson`, `agentPackageJson`, `ssrPackageJson`) each
 * carried their own copy of:
 *
 *   const bunVersion = globalThis.Bun?.version ?? process.versions.bun
 *   const packageManager = pm === 'bun' && bunVersion ? `bun@${bunVersion}` : undefined
 *
 * Two things are wrong with that, and the second one hides the first.
 *
 *   1. `pm === 'bun' &&` means `--pm pnpm` could only ever produce
 *      `packageManager: undefined`, i.e. no field. The flag was threaded all the
 *      way from argv into the generator and then dropped.
 *   2. The published binary's shebang is `#!/usr/bin/env node` (rolldown.config.ts).
 *      Under node, `globalThis.Bun` is undefined AND `process.versions.bun` is
 *      undefined — so even `--pm bun` produced no field. Measured on the built
 *      `dist/bin.js`: `aihu app x --pm bun` and `aihu app x --pm pnpm` emitted
 *      BYTE-IDENTICAL trees. `--pm` was a complete no-op on this path, which is
 *      why (1) was never noticed from the outside.
 *
 * ## What replaces it
 *
 * Ask the package manager. `<pm> --version` is the same one-line answer for all
 * four, and corepack's `packageManager` field wants exactly `<name>@<version>`.
 * The in-process Bun version is still preferred when the CLI is *running* under
 * Bun — it is free and it is authoritative — with the spawn as the fallback that
 * makes the node-shebang case work.
 *
 * A version that cannot be established, or does not look like a version, emits
 * NO field rather than a guess. The original comment already made this call for
 * bun ("drop the field entirely rather than emit a malformed `bun@1` string")
 * and it generalises: a wrong `packageManager` pin is worse than none, because
 * corepack enforces it and refuses to run.
 */

import { spawnSync } from 'node:child_process'
import type { PkgManager } from './index.js'

/** Bare `X.Y.Z…` — what all four package managers print for `--version`. */
const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/

/**
 * One spawn per package manager per process. `appPackageJson` and friends are
 * pure generators called repeatedly (tests call them dozens of times); the
 * answer cannot change mid-run. `null` records "asked, no usable answer" so a
 * missing PM is not re-spawned on every call.
 */
const cache = new Map<string, string | null>()

function probeVersion(pm: PkgManager, spawn: typeof spawnSync): string | null {
  const cached = cache.get(pm)
  if (cached !== undefined) return cached
  let resolved: string | null = null
  try {
    const r = spawn(pm, ['--version'], { encoding: 'utf8', shell: false })
    const out = (r.stdout ?? '').trim()
    if (r.status === 0 && VERSION_RE.test(out)) resolved = out
  } catch {
    // Not installed / not executable — no field.
  }
  cache.set(pm, resolved)
  return resolved
}

/**
 * `"<pm>@<version>"` for the scaffolded `package.json`, or `undefined` when the
 * version cannot be established.
 *
 * @param spawn injectable for tests; defaults to `node:child_process.spawnSync`.
 */
export function packageManagerField(
  pm: PkgManager,
  spawn: typeof spawnSync = spawnSync,
): string | undefined {
  if (pm === 'bun') {
    // Free and exact when the CLI itself is running under Bun. Undefined under
    // the published node-shebang binary, which then falls through to the spawn.
    const inProcess =
      (globalThis as { Bun?: { version: string } }).Bun?.version ?? process.versions.bun
    if (inProcess !== undefined && VERSION_RE.test(inProcess)) return `bun@${inProcess}`
  }
  const probed = probeVersion(pm, spawn)
  return probed === null ? undefined : `${pm}@${probed}`
}

/** Test seam: drop the memoised probe results. */
export function resetPackageManagerFieldCache(): void {
  cache.clear()
}
