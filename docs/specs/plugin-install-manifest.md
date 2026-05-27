# `pluginInstallManifest.json` — Spec

> **DRAFT — pending A4 review** (round 1 of M2-A3, 2026-05-27)

**Owner:** A3 Architect · **Consumer:** A4 (`aihu add <plugin>` CLI)
**Source:** arch-3 §7 Risk register · A3 round-1 Director note §3.5

---

## Purpose

When a user runs `aihu add @aihu/auth`, the CLI must do more than `bun add`.
It must register the plugin in `aihu.config.ts`, scaffold required env vars,
optionally add routes, and run any migration the plugin owns. Hard-coding
this logic per plugin in the CLI does not scale — plugins ship and evolve
independently. `pluginInstallManifest.json` is the per-plugin declarative
contract that lets the CLI execute the right steps for any plugin without
the CLI knowing anything plugin-specific.

The manifest lives at the npm-tarball root of each plugin package
(`packages/<plugin>/install-manifest.json`), is packaged via the package's
`files` field, and is fetched by the CLI from the resolved tarball at
install time. Its schema is the cross-track contract between A3 (plugin
authors) and A4 (CLI authors).

---

## Schema — TypeScript canonical form

```ts
/**
 * Per-plugin install manifest. Lives at the package tarball root as
 * `install-manifest.json`. Loaded by `aihu add <plugin>` after `bun add`
 * resolves the package.
 */
export interface PluginInstallManifest {
  /**
   * Full npm package name (e.g., `@aihu/auth`). MUST match the `name`
   * field of the plugin's package.json. CLI compares to detect mismatches.
   */
  readonly pluginName: string

  /**
   * Plugin version this manifest describes. CLI uses this to refuse to
   * apply a manifest from an unexpectedly-old or unexpectedly-new tarball.
   * SemVer; MUST match the resolved package.json `version`.
   */
  readonly pluginVersion: string

  /**
   * Compatible aihu framework range (semver). The CLI reads
   * `@aihu/plugin`'s `SCRIBE_VERSION` (currently `0.2.0` —
   * packages/plugin/src/index.ts:333) and refuses to install when the
   * range does not satisfy. Matches the `aihuVersion` field on
   * `PluginConfig` (packages/plugin/src/index.ts:259).
   *
   * Range syntax: the same conservative subset `validatePlugin` supports
   * (`^x.y.z`, `~x.y.z`, exact, `*`/`x`). No wider ranges.
   */
  readonly aihuVersion: string

  /**
   * Ordered list of install steps the CLI runs after `bun add` succeeds.
   * Each step is typed; the CLI dispatches on `kind`.
   */
  readonly installSteps: ReadonlyArray<InstallStep>

  /**
   * Environment variables the plugin requires AT RUNTIME (NOT build time —
   * build-time secrets are owned by the build tool). Each entry is added
   * to the project's `.env.example` (creating the file if absent). The
   * CLI does NOT write actual values; it leaves the user a `=` placeholder.
   *
   * Example: `[{ name: 'JWT_SECRET', description: 'HMAC key for JWT signing' }]`
   */
  readonly requiredEnv?: ReadonlyArray<{
    readonly name: string
    readonly description: string
    readonly default?: string  // Only for non-secret defaults like 'production'
  }>

  /**
   * Additional npm packages to install alongside the main plugin. Per the
   * dep-free thesis (Learning #49), A3 plugins MUST NOT use this to pull
   * in non-`@aihu/*` deps at runtime; this array is restricted to
   * `@aihu/*` workspace package names (e.g., `@aihu/auth` may list
   * `@aihu/scraping` here for rate-limit middleware reuse).
   *
   * The CLI enforces the `@aihu/*` prefix on this list and errors out if
   * a plugin manifest lists a non-`@aihu/*` name.
   */
  readonly additionalPackages?: ReadonlyArray<string>

  /**
   * Human-readable summary shown by the CLI before applying steps.
   * Example: `"Installs JWT auth, sign-in/sign-out routes, and ScopeSignal client."`
   * Max 200 chars.
   */
  readonly summary?: string
}

/** Discriminated union of install-step kinds. */
export type InstallStep =
  | AddPluginToConfigStep
  | AddRouteStep
  | AddEnvVarStep
  | RunMigrationStep

/**
 * Insert `import { <factory> } from '<pluginName>'` and add
 * `<factory>({...})` to the `plugins: []` array in `aihu.config.ts`.
 *
 * Idempotent: re-running on a config that already has this entry is a
 * no-op (CLI MUST detect existing registration by matching `factoryName`
 * + `pluginName`).
 */
export interface AddPluginToConfigStep {
  readonly kind: 'add-plugin-to-config'
  /** Exported factory name (e.g., `'auth'`, `'magna'`, `'seo'`). */
  readonly factoryName: string
  /**
   * Default options shape to render inline. JSON-serializable values only.
   * The CLI emits this as a TypeScript object literal; users edit afterward.
   * Example: `{ jwtSecret: 'process.env.JWT_SECRET' }` (the CLI renders
   * `process.env.JWT_SECRET` as a bare identifier when the value matches
   * the `process.env.*` pattern).
   */
  readonly defaultOptions?: Readonly<Record<string, unknown>>
}

/**
 * Register one or more route-handler factory imports + `defineRoute(...)`
 * calls into `apps/<app>/src/routes.ts` (or wherever `createRequestRouter`
 * is wired). Per A3 round-1 §2.1 (router factory pattern), plugins export
 * factories like `createAuthRoutes(config)` returning a record of
 * `RouteHandler`; this step automates the wiring.
 */
export interface AddRouteStep {
  readonly kind: 'add-route'
  /** Factory exported by the plugin (e.g., `'createAuthRoutes'`). */
  readonly factoryName: string
  /**
   * Routes to register. Each is `[path, handlerKey]` — the CLI emits:
   *   `defineRoute(path, <factoryResult>.<handlerKey>)`.
   */
  readonly routes: ReadonlyArray<{
    readonly path: string
    readonly handlerKey: string
  }>
}

/** Add an entry to `.env.example`. Materializes a `requiredEnv` row. */
export interface AddEnvVarStep {
  readonly kind: 'add-env-var'
  readonly name: string
  readonly description: string
  readonly default?: string
}

/**
 * Apply a migration the plugin ships (e.g., a magna SDL extension or a
 * SQL migration for a plugin that owns its own schema). Reserved for M3+ —
 * v1.0 CLI MAY refuse-and-log when a manifest contains this kind. Listed
 * here so the schema is extensible without a major bump.
 */
export interface RunMigrationStep {
  readonly kind: 'run-migration'
  /** Path inside the plugin tarball (e.g., `'migrations/0001_init.sql'`). */
  readonly path: string
  /** Migration backend. `'magna-sdl'` is the only v1.0 value. */
  readonly backend: 'magna-sdl' | 'sql'
}
```

---

## File location convention

Each plugin ships its manifest at the package tarball root:

```
packages/<plugin>/install-manifest.json
```

Required `package.json` excerpt:

```json
{
  "files": ["dist", "install-manifest.json"]
}
```

The CLI resolves the manifest via `require.resolve('<pluginName>/install-manifest.json')`
after `bun add` completes. If the manifest is missing, `aihu add` falls back
to a "manual install" message that lists the plugin homepage and exits 0.

---

## Worked example — `@aihu/seo`

`packages/seo/install-manifest.json`:

```json
{
  "pluginName": "@aihu/seo",
  "pluginVersion": "0.1.0",
  "aihuVersion": "^0.2.0",
  "summary": "Installs sitemap, JSON-LD, canonical, and llms.txt extensions for SEO.",
  "installSteps": [
    {
      "kind": "add-plugin-to-config",
      "factoryName": "seo",
      "defaultOptions": {
        "siteName": "My App",
        "baseUrl": "process.env.SITE_URL"
      }
    },
    {
      "kind": "add-route",
      "factoryName": "createSeoRoutes",
      "routes": [
        { "path": "/sitemap.xml", "handlerKey": "sitemapXml" },
        { "path": "/robots.txt", "handlerKey": "robotsTxt" }
      ]
    },
    {
      "kind": "add-env-var",
      "name": "SITE_URL",
      "description": "Canonical site URL used by sitemap and OG tags",
      "default": "https://example.com"
    }
  ],
  "requiredEnv": [
    {
      "name": "SITE_URL",
      "description": "Canonical site URL used by sitemap and OG tags",
      "default": "https://example.com"
    }
  ]
}
```

After `aihu add @aihu/seo`, the user's `aihu.config.ts` gains:

```ts
import { seo } from '@aihu/seo'
// …
export default defineAihuConfig({
  plugins: [seo({ siteName: 'My App', baseUrl: process.env.SITE_URL })],
})
```

And their route module gains:

```ts
import { createSeoRoutes } from '@aihu/seo'
const seoRoutes = createSeoRoutes({ /* … */ })
// …
defineRoute('/sitemap.xml', seoRoutes.sitemapXml),
defineRoute('/robots.txt', seoRoutes.robotsTxt),
```

`.env.example` gains:

```env
# Canonical site URL used by sitemap and OG tags
SITE_URL=https://example.com
```

---

## Migration / versioning policy

- **`pluginVersion`** is the source of truth — CLI MUST refuse to apply a
  manifest whose `pluginVersion` doesn't match the resolved `package.json`
  `version`.
- **`aihuVersion`** uses the same range subset as `PluginConfig.aihuVersion`
  (see `packages/plugin/src/index.ts:422-463` `satisfies`). CLI rejects
  install when the host project's framework version falls outside.
- **Adding new `InstallStep` kinds** is a minor bump of the schema; CLI
  versions that don't understand a kind MUST skip it with a warning, not
  fail. The `run-migration` kind is the canonical example — v1.0 CLI
  warn-skips it; M3 CLI executes it.
- **Removing a field** is a major bump. Plugins targeting an older CLI
  range must keep deprecated fields populated until the major boundary.
- **Schema evolution lives at the top of this spec file.** Each schema
  version increment appends a "schema version" header (v1, v2, …); the CLI
  reads the schema field (`$schema` reserved for future use) to pick the
  parser. v1.0 manifests omit `$schema` and are parsed by the v1 reader.

---

## A4 consumer notes (CLI behavior)

For each field, the CLI MUST:

| Field | CLI behavior |
|---|---|
| `pluginName` | Compare to resolved package; error and abort on mismatch. |
| `pluginVersion` | Compare to resolved package.json `version`; error and abort on mismatch. |
| `aihuVersion` | Read host project's `@aihu/plugin` version (or `aihu.config.ts`-declared framework); refuse install on mismatch. |
| `installSteps` | Execute in order. Each step MUST be idempotent — re-running `aihu add <plugin>` MUST converge, not duplicate. |
| `requiredEnv` | Append missing entries to `.env.example`; never overwrite existing values. |
| `additionalPackages` | Run `bun add` for each entry. Enforce `@aihu/*` prefix; abort on non-`@aihu/*` names. |
| `summary` | Print before running steps, prompt user to confirm (`--yes` flag bypasses). |
| `installSteps[].kind: 'add-plugin-to-config'` | AST-edit `aihu.config.ts`: import + plugins array entry. Idempotent by `factoryName`. |
| `installSteps[].kind: 'add-route'` | AST-edit the routes module: import the factory, instantiate once, add `defineRoute(...)` entries. Idempotent by path. |
| `installSteps[].kind: 'add-env-var'` | Same as `requiredEnv` — append to `.env.example`. |
| `installSteps[].kind: 'run-migration'` | v1.0 CLI: warn-skip with "manual migration required". M3+ CLI: execute via the named backend. |

The CLI itself ships no plugin-specific code. The manifest is the entire
contract. New plugins authored after the CLI lands are installable without
a CLI release.

---

**End of DRAFT spec.** A4 reviews this before EX-10 (CLI `aihu add` command)
lands; round-2 A3 Architect dispatch may amend pending A4 feedback.
