# Cross-package version drift (Bug 3 class)

**Topic:** aihu-v1-framework
**Round:** 7
**Category:** release-engineering, monorepo-hygiene
**Severity:** high (silent corruption of consumer installs)

## The lesson

When package X publishes `optionalDependencies` or `peerDependencies` pinning sibling package Y at version Y@v, the publish step MUST verify that Y@v has actually been published to npm. The `publish-native` idempotency check in our `publish-all.sh` script silently SKIPS the publish if Y@v exists at any version — including the OLD version, before Y was bumped.

This means: a Release-PR can bump Y from 0.1.0 → 0.1.1, and X@latest will start declaring `optionalDependencies: { Y: "0.1.1" }`, but Y@0.1.1 itself is never actually pushed to the registry. Consumers running `npm install X` get an install-time failure or, worse, fall back to a stale cached Y@0.1.0 with subtly different behavior.

## How it bit us this session

`@aihu/agent-service@0.1.3` cascaded a peer-bump to `@aihu/agent-a2a` and `@aihu/agent-acp`. Both were bumped in the workspace `package.json` files, but only one was in the `PKGS` array in `publish-all.sh`. Result: `agent-service@0.1.3` declared `peerDependencies` against an unpublished `agent-a2a@0.1.1`. Consumers couldn't install agent-service for ~6 hours until the gap was caught.

## The rule

Any PR that bumps package X's version where X has `peerDependencies` or `optionalDependencies` referencing internal sibling packages MUST verify, post-merge:

1. All referenced siblings are present in `scripts/publish-all.sh` PKGS array
2. The Release-PR workflow actually executed publishes for those siblings (check the workflow log, not just changeset's claim)
3. `npm view @aihu/<sibling>@<expected-version>` returns 200, not 404

## Detection

Add to CI:

```bash
# After release, validate every internal peerDependency resolves on the registry.
for pkg in $(jq -r '.packages | keys[]' package-lock.json); do
  jq -r '.peerDependencies // {} | to_entries[] | select(.key | startswith("@aihu/")) | "\(.key)@\(.value)"' "$pkg/package.json"
done | sort -u | while read spec; do
  npm view "$spec" version >/dev/null || { echo "MISSING: $spec"; exit 1; }
done
```

## Related

- Lesson: `publish-all-pkgs-array.md` (root cause one layer up)
- Lesson: `compiler-grammar-needs-changeset.md` (same family: silent version skew)
