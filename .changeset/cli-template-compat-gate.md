---
'@aihu/cli': minor
'@aihu/templates-cf-team': patch
---

Enforce a template's declared `cliRange` / `contractVersion` instead of parsing and ignoring them.

`validateManifest()` read both fields off every `template.config.ts` and then
compared them against nothing at all. Because nothing could be wrong, the
declaration drifted: `@aihu/templates-cf-team` shipped `cliRange: '^0.2.0'`
against a CLI at 1.2.x, so the only publishable template asserted an
incompatibility with every CLI able to install it, for six minors, silently.

`scaffoldFromTemplatePackage` — the single driver both `aihu app --template` and
`create-aihu` run — now calls `assertTemplateCompatibility()` before any file is
written or any package installed, and fails in the same loud style as the
existing `unpublished`/`unknown` template cases: it names the template, both
versions, and what to do about it. An **unreadable** range fails too; the point
of enforcing the field is that an unenforceable declaration must not pass.

The range check is a small hand-rolled module (`semver-range.ts`) rather than a
new dependency: `@aihu/cli` carries exactly one runtime dependency, no package in
this repo depends on `semver`, and this is one comparison. It implements the npm
grammar a manifest realistically writes — caret (including the 0.x rules), tilde,
comparators, partial/wildcard forms, `||` and space composition — plus the
prerelease rule that stops `^1.0.0` from matching `2.0.0-beta.1`. A prerelease
CLI is checked as its release core, so a canary build does not fail every
template.

`cf-team`'s range is corrected to `^1.0.0` — the CLI line that actually ships
`scaffoldFromTemplatePackage` (added in 1.0.1), with a real upper bound so a 2.0
CLI stops rather than half-scaffolding.
