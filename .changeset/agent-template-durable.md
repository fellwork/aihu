---
"@aihu/cli": patch
---

feat(cli): the `agent` template ships client-durable state

The scaffolded `<task-list>` now hydrates its signals from `localStorage` on
mount and writes back on every change, so the durable component **survives a
page refresh** out of the box. Because the agent's bridge calls drive the same
signals, an agent's reskin (label, variant, tasks) persists too. Browser-only
and guarded, so build/SSR safely fall back to defaults. (For state shared across
tabs/devices, move the source of truth server-side — e.g. a Durable Object / KV
behind the agent gate.)
