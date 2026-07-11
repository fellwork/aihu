---
"@aihu/compiler": patch
---

fix: ship the spread-of-signal rewrite in the platform binary

The spread-rewrite fix (0.9.10) lives in the Rust `aihu-compile` binary, which
distributes via the `@aihu/compiler-<platform>` packages — but those were pinned
at `0.1.0`, so the release's idempotency guard skipped republishing them and the
new binary never reached consumers. Bump the five platform binary packages to
`0.1.1` and point the glue's `optionalDependencies` at them so the rebuilt
compiler (with the spread fix) actually installs.
