# @aihu/templates-cf-team

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
