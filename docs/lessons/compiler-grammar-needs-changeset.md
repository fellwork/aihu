# Compiler version bump for grammar changes

**Topic:** aihu-v1-framework
**Round:** 7
**Category:** release-engineering, monorepo-hygiene, compiler
**Severity:** high (silent consumer-side regression)

## The lesson

When `packages/compiler/src/**` changes ship via a PR without a corresponding changeset, `@aihu/compiler`'s `version` field doesn't bump. Consumers using `@aihu/compiler@latest` (or transitively through `@aihu/cli`, `@aihu/server`, etc.) get the OLD compiled binary from npm. The new grammar / parser / IR changes ship to git but never to the registry.

This is silent. The PR's tests pass (because they use the local source). Tests on `main` pass. Downstream packages that depend on `@aihu/compiler` build fine. Only when an external consumer (or a non-monorepo dogfood project) runs `npm install` do they get the old binary — and only when they try to use the new grammar feature do they see the regression.

## How it bit us this session

PR #168 (v1.0.7 dual-grammar removal) and PR #170 (v1.0.8 `:attr`/`@event` removal + Amendment 04) both modified `packages/compiler/src/parser/**` extensively. Neither PR included a changeset for `@aihu/compiler`. Both merged green. ~24 hours later, a dogfood SPA project running `@aihu/compiler@^0.2.0` started failing to parse the new `$attr={expr}` syntax — because the npm registry still served `@aihu/compiler@0.2.0` with the old grammar.

Investigator R5.1 root-caused this; the fix was `@aihu/compiler@0.3.0` republish covering both PRs.

## The rule

Any PR that touches `packages/compiler/src/**` MUST include a changeset for `@aihu/compiler`. Add a CI check:

```bash
# .github/workflows/ci.yml — add to PR validation
- name: Compiler changeset required
  run: |
    if git diff --name-only origin/main...HEAD | grep -q '^packages/compiler/src/'; then
      if ! ls .changeset/*.md 2>/dev/null | xargs -I {} grep -l '"@aihu/compiler"' {} >/dev/null; then
        echo "ERROR: changes to packages/compiler/src/** require a changeset bumping @aihu/compiler"
        echo "Run: bun changeset"
        exit 1
      fi
    fi
```

Same rule applies to any package whose runtime artifacts ship pre-compiled (so source changes don't take effect via the workspace's symlinks alone): `@aihu/signals`, `@aihu/arbor`, `@aihu/runtime`, future Rust-native packages.

## Generalization

The deeper lesson: **the workspace symlink hides the registry-staleness bug**. In a monorepo, local consumers always see the latest source. The only way to detect "I shipped to git but not to npm" is to either (a) test against the registry (slow, flaky), or (b) make the changeset requirement a hard gate at PR time. We're picking (b).

## Related

- Lesson: `cross-package-version-drift.md` (sibling class: peer pin → unpublished)
- Lesson: `publish-all-pkgs-array.md` (sibling: bumped but not pushed)
