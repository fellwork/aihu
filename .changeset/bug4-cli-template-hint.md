---
"@aihu/cli": patch
---

Surface the `--template=cf-team` option in `aihu app` usage text and clarify in `llms-full.txt` that the no-flag `aihu app <name>` is a client-only Vite + router SPA while `--template=cf-team` scaffolds the deployable Cloudflare monorepo (workspaces, wrangler, auth, agent surface).

Docs-only patch. The underlying scaffolder fix already shipped in `@aihu/cli@0.5.2` (PR #247); this addresses follow-up discoverability friction reported by users who expected an SPA-first scaffold and weren't aware of the `--template` flag.
