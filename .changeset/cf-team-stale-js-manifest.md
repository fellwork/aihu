---
'@aihu/templates-cf-team': patch
---

Fix the stale `template.config.js`, which disabled every conditional file for Node users.

`loadTemplateConfig` prefers `template.config.ts` and falls through to the
hand-maintained `template.config.js` whenever the runtime cannot import
TypeScript — which is **always**, for the published `#!/usr/bin/env node`
binary. The two files had diverged: the `.js` copy's `conditionalFiles` still
named post-strip TARGET paths (`apps/web/src/auth/kinde.ts`) instead of the
`.tmpl` SOURCE paths that exist on disk, and carried none of the F-5b `rename`
fields.

Nothing matched, so under Node not one conditional fired. Every `cf-team`
scaffold:

- wrote **all three** auth providers' files while installing only the chosen
  provider's SDK, and
- emitted `.env.example.better-auth` instead of `.env.example`.

The scaffolded project then failed its own `bun run typecheck` with TS2307 on
`@kinde-oss/kinde-typescript-sdk` and `@supabase/supabase-js`. This is the
failure the `scaffold-consistency` CI job records as a moon `HEAD~1` problem;
that diagnosis was wrong — moon does not consult `HEAD~1` for a plain
`moon run :typecheck`, and a fresh one-commit scaffold typechecks clean once the
manifest is fixed. The CI comment is corrected.

In-repo harnesses run `bun src/bin.ts`, take the `.ts` copy, and never saw any
of it. A deep-equality parity test over both manifests now guards the pair, plus
a check that every `conditionalFiles` path names a file that actually exists
under `template/` — a `when` guarding a path in no tree is not a guard, it is a
no-op.
