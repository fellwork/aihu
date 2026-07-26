---
'@aihu/templates-cf-team': patch
---

Fix unsatisfiable dependency pins — the scaffolded project could not install.

`apps/web/package.json.tmpl` pinned six `@aihu/*` packages at `^0.2.0`, which
no longer resolve:

  @aihu/adapter-cloudflare  ^0.2.0 -> published 8.0.0
  @aihu/arbor               ^0.2.0 -> published 4.0.0
  @aihu/runtime             ^0.2.0 -> published 5.0.0
  @aihu/router              ^0.2.0 -> published 0.4.2
  @aihu/server              ^0.2.0 -> published 0.4.1
  @aihu/signals             ^0.2.0 -> published 0.5.0

`aihu app --template cf-team` therefore produced a project whose very first
command failed:

  FAILED pm-install: bun install exited with status 1
  error: No version matching "^0.2.0" found for specifier "@aihu/arbor"
         (but package exists)

Switched to `latest`, matching the convention the agent template already uses.
Verified end to end outside the monorepo: scaffold completes and
`bun install` exits 0 with zero resolution errors.
