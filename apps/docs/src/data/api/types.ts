/**
 * Shared shapes for the generated API datasheet.
 *
 * Hand-authored. The per-package data modules under `./generated/*` and the
 * `./generated/index.ts` roll-up are EMITTED by `scripts/gen-api.ts` — a
 * deterministic, re-runnable extractor over `scripts/__package-inventory.json`
 * plus each package's `src` entry (or `.d.ts` fallback). Run `bun scripts/gen-api.ts`
 * to regenerate; `bun scripts/gen-api.ts --check` fails on drift (like sync-readme).
 */

/** One public export of a package, rendered as a datasheet row. */
export interface ApiExport {
  readonly name: string
  /** The declaration keyword — the datasheet's middle "declaration" column. */
  readonly kind: 'function' | 'const' | 'class' | 'interface' | 'type' | 'enum' | 'component'
  /** The typed signature (body stripped) — the datasheet's leading column. */
  readonly signature: string
  /** First sentence of the export's JSDoc, plain text. */
  readonly summary: string
  /** `@since` version, if declared. */
  readonly since?: string
  /** `@deprecated`, if flagged. */
  readonly deprecated?: boolean
  /** Agent-relevant surface (governance / expose / discovery axis). Graphite chip. */
  readonly agent?: boolean
}

/** A package's datasheet header metadata. */
export interface ApiPackage {
  readonly name: string
  readonly slug: string
  readonly tier: string
  readonly version: string
  readonly tagline: string
  /** Shown when a package exposes no importable API (CLI / editor tooling). */
  readonly note: string
}

/** Index-page roll-up row: header metadata + export counts. */
export interface ApiPackageMeta extends ApiPackage {
  readonly exportCount: number
  readonly valueCount: number
  readonly typeCount: number
  readonly agent: boolean
}
