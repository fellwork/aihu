---
'@aihu/templates-cf-team': minor
'@aihu/cli': minor
---

Stop scaffolding `"latest"` — generate the dependency ranges at release time,
and gate them.

Every `@aihu/*` entry a scaffold emitted was the literal string `"latest"`, in
four separate places (`appPackageJson`, `agentPackageJson`, the plugin scaffold,
and cf-team's `apps/web/package.json.tmpl`). That is not a version, it is a
promise to resolve later, and for a scaffolding tool it is three problems at
once:

- **Not reproducible.** A project scaffolded today and one scaffolded in six
  months have a byte-identical `package.json` and install two different
  dependency graphs. Neither manifest records which one it was.
- **Not auditable.** `"latest"` is compatible with every future major, so a
  breaking `@aihu/runtime` publish reaches every existing scaffold on its
  owner's next `install` rather than on an upgrade they chose.
- **Not reviewable.** No sync mechanism existed, so nothing could be wrong and
  nothing could be checked. Two hand-typed ranges were already dead on arrival
  and nobody had noticed: cf-team's `appPeerDeps` still said `^0.2.0` while
  `@aihu/runtime` was on 6.0.0, and the plugin scaffold's peer said `^0.8.0`
  while `@aihu/plugin` was on 0.1.0. Neither range resolves to anything.

`scripts/sync-template-versions.ts` now derives one caret range per non-private
workspace package from that package's own `package.json` and writes
`packages/cli/src/dep-versions.ts` plus the three cf-team targets. There is no
curated list to drift out of date: add a package and it appears; bump one and
its range moves. It runs inside `release:version`, immediately after `changeset
version` sets the versions that release is about to publish — so the ranges a
published `create-aihu` carries name versions that same release put on npm.

`check:template-versions` (a new always-on `ci-ok` job) fails when any target
disagrees with the workspace it was generated from, so a hand edit, or a version
bump without the regen, cannot ship. Its red path is proven by a negative
fixture in `check-gate-wiring`, red and green differing in exactly one version
string.

A caret rather than an exact pin, deliberately: a scaffold is a starting point,
and `^6.0.0` lets a new project take `6.0.1` without editing a manifest while
still refusing `7.0.0`. Prereleases are pinned exactly — `^1.0.0-rc.1` excludes
`rc.2` but includes `1.0.0`, which is not what anyone means by it.
