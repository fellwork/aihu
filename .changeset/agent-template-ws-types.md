---
'@aihu/cli': patch
---

Fix the agent template's typecheck failing again on a fresh scaffold.

`bun run typecheck` — the command the template's own next-steps prints —
failed with TS7006 on the websocket `message` handler's parameters. Contextual
typing from `Bun.serve`'s handler map does not reach them, so under the
scaffolded project's `strict` they are implicit-any.

This is a regression, not a new bug: #595 fixed this class of error by adding
`@types/bun` and `skipLibCheck`, and #601 reintroduced it while wiring the
readiness surface into `server.ts`. Both websocket handler blocks in the
generator are fixed, and the reasoning is recorded inline so the next edit to
that file does not undo it a third time.

Verified on a real npm scaffold outside the monorepo: `typecheck` exits 0 with
zero implicit-any errors.
