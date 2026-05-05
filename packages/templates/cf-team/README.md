# @aihu/templates-cf-team

> **Aihu** — agentic discovery and interaction, for human purpose.

Cloudflare Workers + monorepo (bun workspaces + moon) team template for Aihu

Held-private workspace package. Not yet published to npm.

> **Status:** Held private — not yet published to npm. See [v1.1 roadmap](../../docs/roadmap/SUMMARY.md) for ratification gating (e.g. RFC #56 live-binding for `@aihu/plugin` enforcement).

<!-- BEGIN_HANDWRITTEN: prose -->
Cloudflare Workers + monorepo (bun workspaces + moon) team template for Aihu.

This package is consumed by `@aihu/cli` at scaffold time. End users do not
install it directly — they run:

```bash
bunx create-aihu my-app --template cf-team
```

## What this template ships

Fixed cells (not user-overridable):

- **Vendor** — Cloudflare Workers (`@aihu/adapter-cloudflare`)
- **Persona** — team-ready
- **Repo shape** — monorepo with `bun` workspaces + `moon` task runner
- **Lint** — Biome
- **CI** — GitHub Actions + commitlint
- **Test** — Vitest

Overridable cells (prompted at scaffold time):

- **`auth`** — `better-auth` (default) | `kinde` | `supabase`
- **`starter`** — `live-counter` (default) | `empty`
- **`agentSurface`** — `minimal` (default; emits `.mcp.json` + `@expose`) | `none`
- **`css`** — `style-block` (Tailwind defers to v0.2.1)
- **`initGit`** — `true` (default) | `false`

The full manifest lives in [`./template.config.ts`](./template.config.ts);
the source tree the CLI copies + substitutes into the user's project lives
under [`./template/`](./template/).

## Design notes

- Per arch-6 §1.3 this is the **recommended default** template. CF was
  picked as the default vendor because the framework's adapter, deploy
  surface, and edge-first execution model are most mature there.
- Per §2.5, every M1 template emits the same locked `.mcp.json` content
  unless `agentSurface === 'none'`.
- Per §13 Q3 RESOLVED, the three auth providers are gated as conditional
  file sets — only the chosen provider's files land in the scaffolded
  project.

## See also

- [`@aihu/cli`](../../cli) — the scaffolder that consumes this package
- [`docs/roadmap/arch-6-cli-templates.md`](../../../docs/roadmap/arch-6-cli-templates.md) — the architecture spec
<!-- END_HANDWRITTEN: prose -->

## Install

<!-- BEGIN_AUTOGEN: install -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

```bash
npm install @aihu/templates-cf-team
# or
bun add @aihu/templates-cf-team
```

<sub><i>Auto-generated against `@aihu/templates-cf-team@0.2.0` on commit `65a4b02`.</i></sub>

<!-- END_AUTOGEN: install -->

## Package facts

<!-- BEGIN_AUTOGEN: stats -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

| | |
|---|---|
| **Version** | `0.2.0` |
| **Tier** | E — Held private (unmapped tier) |
| **Published files** | 4 entries |
| **License** | MIT |

<sub><i>Auto-generated against `@aihu/templates-cf-team@0.2.0` on commit `65a4b02`.</i></sub>

<!-- END_AUTOGEN: stats -->

## Exports

<!-- BEGIN_AUTOGEN: exports -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

_No `exports` field in `package.json`. Main entry: `./template.config.ts`._

<sub><i>Auto-generated against `@aihu/templates-cf-team@0.2.0` on commit `65a4b02`.</i></sub>

<!-- END_AUTOGEN: exports -->

## Dependencies

<!-- BEGIN_AUTOGEN: deps -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

**Peer dependencies:**

- `@aihu/cli` — `^0.2.0`

<sub><i>Auto-generated against `@aihu/templates-cf-team@0.2.0` on commit `65a4b02`.</i></sub>

<!-- END_AUTOGEN: deps -->

## See also

<!-- BEGIN_AUTOGEN: see-also -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

- [Aihu framework root](../../../README.md)
- [v1.1 roadmap](../../../docs/roadmap/SUMMARY.md)

<sub><i>Auto-generated against `@aihu/templates-cf-team@0.2.0` on commit `65a4b02`.</i></sub>

<!-- END_AUTOGEN: see-also -->

## License

<!-- BEGIN_AUTOGEN: license -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

MIT — see [LICENSE](../../../LICENSE).

<sub><i>Auto-generated against `@aihu/templates-cf-team@0.2.0` on commit `65a4b02`.</i></sub>

<!-- END_AUTOGEN: license -->
