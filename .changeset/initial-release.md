---
---

Initial public release at `0.1.0` (early access).

This is an empty changeset, intentionally. The first release ships the `0.1.0`
versions already authored in each `packages/*/package.json` by tagging `v0.1.0`
on the main branch directly. Subsequent releases follow the standard Changesets
flow: contributors add a `.changeset/*.md`, the `release-pr` workflow opens a
"Version Packages" PR with the bumped versions, merging that PR creates a tag,
and `release.yml` then publishes to npm.

API may evolve before v1.1 GA per the [v1.1 roadmap](https://github.com/fellwork/aihu/tree/main/docs/roadmap).
