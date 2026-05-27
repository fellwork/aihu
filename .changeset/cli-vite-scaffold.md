---
"@aihu/cli": patch
---

Default `bunx @aihu/cli app NAME` scaffold switches from rolldown to Vite + `viteAihuPlugin()`. The prior rolldown output was not runnable end-to-end — `createApp()` from `@aihu/app/client` imports `virtual:aihu-routes`, a Vite-plugin virtual module with no rolldown equivalent, so `bun run dev` produced an app that could not route. Mirrors `examples/blog-router`; matches the direction `apps/docs` already moved.

Also: `index.html` now uses `<div id="outlet">` + `./src/main.ts` (matches `createApp()`'s default mount target — the prior `<demo-root>` custom element threw on boot); `@aihu/router` is now an explicit runtime dependency; the dead `commands/app.ts` divergent Vite scaffold and the unreachable `appRolldownConfig` / `appViteConfig` back-compat alias have been removed.

Marked as `patch` rather than `minor`: the user-facing contract (`aihu app` command) is functionally additive (it now produces a runnable project instead of a broken one), and the removed JS exports (`appRolldownConfig`, `appViteConfig`) are not depended on by any in-repo consumer. Patch avoids cascading a major bump onto `@aihu/templates-cf-team`'s `^0.5.1` peer range.
