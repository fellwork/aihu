---
'@aihu/app': minor
'@aihu/cli': minor
---

Scaffold `aihu.config.ts` — the project configuration surface every generated app was missing

`aihu app <name>` now writes an `aihu.config.ts`, and `vite.config.ts` becomes a
thin wrapper that hands it to `viteAihuPlugin()`.

The generator for this file already existed (`appAihuConfig()`) and was never
called by any template. The consequences were user-visible:

- every scaffolded project shipped with **no aihu config at all**, so the
  framework's own configuration path had no file to live in;
- `vite.config.ts` hand-wired `viteAgentReadinessIntegration()` inline instead
  of going through `viteAihuPlugin`'s `agentReadiness` option — not an oversight
  so much as the only route available;
- `aihu add` failed with `no-config` inside a project the CLI had just created,
  and its error advised *"create one with: `aihu app <name>`"* — the command that
  produced the configless project.

Also in this change:

- **`@aihu/app`'s `AihuConfig` gains `ui?: UiConfig`**, so one config file serves
  both the Vite build and the `aihu add` CLI. Declared locally rather than
  re-exported from `@aihu/server` to avoid forcing a server dependency into
  client-only app templates.
- **No MCP `endpoint` in the scaffolded config.** The previous one set
  `endpoint` to the server card's *own* URL, which published a card advertising
  zero tools and named the discovery document as its own transport. A static
  client build has no process to serve an MCP endpoint, so the card is no longer
  emitted at all (FEL-423).
- **The scaffolded page's prose no longer claims its actions are callable MCP
  tools.** In a static build they are declared but not callable over HTTP; the
  page now says so and points at `agentReadiness.endpoint` for making them real.
- **`tsconfig.json` includes the config files** (with `skipLibCheck`), so a typo
  in `aihu.config.ts` is a typecheck error rather than a silently-ignored field.

The default-scaffold snapshot fixture is regenerated. Its previous contract —
an R-CT-06 backward-compat *freeze* pinning the default to a v0.2.0 artifact —
is retired: it guaranteed the default scaffold could never be current, and the
frozen tree predated `aihu.config.ts` existing. The snapshot mechanism is kept,
so scaffold changes still surface as a reviewable diff.
