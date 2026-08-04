---
'@aihu/language-server': minor
'@aihu/compiler': minor
'@aihu/use': major
---

Remove `useSwarm` and the `@aihu/use/useSwarm` subpath export.

**Breaking for `@aihu/use`:** the `./useSwarm` entry point is gone, along with
the `useSwarm` value export from the package root and its `SwarmRecord` /
`SwarmState` / `SwarmYourMove` / `UseSwarmOptions` / `UseSwarmReturn` types.

`useSwarm` was never a general-purpose composable. It spoke a private HTTP/SSE
protocol on `http://127.0.0.1:8791` — the local swarm command-center bus — and
carried 250 lines of schema validation for that one wire format. `@aihu/use` is
the library of composables that apply to any aihu app; a client for one
internal dev tool does not belong in it, and shipping it published a
maintenance surface no external consumer could use.

Its only consumer, `apps/swarm-console`, is removed in the same change. That app
was private, had no moon project, and ran in no CI workflow.

`@aihu/compiler` and `@aihu/language-server` drop their corresponding registry
entries, so `useSwarm` no longer appears in auto-import resolution or editor
hover. Both are minor rather than major: nothing they exported changed shape,
one row left a lookup table.
