# legacy-snapshot golden fixture

Provenance annotation for the fixture in this directory. Not scaffold output —
the harness skips a top-level `README.md` when walking the golden tree (the skip
is one-sided, so if the scaffold ever *does* start emitting one, the comparison
fails loud rather than silently un-gating it).

## What this fixture is

Every byte `aihu app <name> --pm bun` writes, with no `--template` flag (which
resolves to `minimal`). The test byte-compares the produced tree against this
one, so no change to the default scaffold can land without a reviewer seeing it
as a diff.

## Regenerated 2026-07-26

Previous contract: a backward-compat **freeze** — R-CT-06, "the pre-templates
`aihu app` workflow keeps producing the same artifact for v0.2.0" (arch-6
§7.3/§8.8).

That contract was retired deliberately. Pinning the default scaffold to a
v0.2.0 artifact guaranteed the default could never be current, which is the
opposite of what a starting point is for. Concretely, the frozen tree predated
`aihu.config.ts` being scaffolded at all — so honoring the freeze meant every
new project shipped without the framework's own configuration surface, and
`aihu add` failed with `no-config` inside a project the CLI had just created.

What changed in this regeneration:

- **`aihu.config.ts` is new.** It carries `dir`, `app.head`, and the
  `agentReadiness` block. The generator for it already existed and was simply
  never called by any template.
- **`vite.config.ts` shrank.** It no longer inlines `dir.pages`, the css
  `shadowMode`, or a hand-wired `viteAgentReadinessIntegration(...)` call —
  those moved into `aihu.config.ts`, which `viteAihuPlugin` consumes.
- **No MCP `endpoint`.** The old config set `endpoint` to the server card's own
  URL, which published a card advertising zero tools and named the discovery
  document as its own transport. A static client build has no process to serve
  an MCP endpoint, so the card is now not emitted at all (FEL-423).
- **`tsconfig.json` includes the config files**, so a typo in `aihu.config.ts`
  is a typecheck error rather than a silently-ignored field.

## Refreshing

Delete this directory and run the test twice — the first run writes the fixture
and fails on purpose, the second verifies the produced tree matches it. The
harness refuses to self-generate in CI, where a missing golden means the fixture
was deleted rather than intentionally refreshed.

```
bun run test packages/cli/tests/legacy-snapshot.test.ts --config vitest.gates.config.ts
```

Note the `--config`: the root vitest config **excludes** this test so it isn't
double-run by the coverage pass. It has its own CI step in `plan-a.yml`.
