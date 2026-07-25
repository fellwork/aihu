---
"@aihu/compiler": patch
---

Emit `html={expr}` into the SSR string, and bump the platform binary packages so
the fix can actually ship.

`html={expr}` was classified an SSR-transparent element effect alongside
`show`/`class:`/`ref`. Those are genuinely mount-time behaviours; `html` is not —
its value **is** the element's content. So `__ssrString` serialised the element
empty and the content only appeared once the client's `onMount replaceChildren`
ran. Any page whose body is an `html` binding prerendered hollow: correct in a
browser, invisible to crawlers, agents, and agent-readiness graders.
`emit_element_base` now interpolates the expression unescaped (nullish → `''`);
`raw` still wins and suppresses children.

**This is a served-bytes change, not just a DOM change.** The expression is now
interpolated unescaped into the static HTML you ship, so `html=` is an SSR-time
injection with the same contract as `innerHTML` — never point it at untrusted or
remote content.

Binary packages bumped: `packages/compiler/npm/*` `0.1.36` → `0.1.37` and
`packages/compiler/npm-native/*` `0.1.1` → `0.1.2`, with
`optionalDependencies` repointed.

Both sets deliberately. `check:compiler-binary-bump` is satisfied by *either*
(`changedFiles.some(isPlatformManifest)`), but `npm-native/` is the set
`envelope.ts` loads in-process, so bumping only `npm/` leaves the napi addon
stale — the same staleness this change exists to escape. Filed upstream as
FEL-414; the assertion that guard actually needs is "when compiler Rust changes,
`npm-native/` must be **strictly greater than the published** version", since
*changed* is not *advanced*.

The `@aihu/compiler` patch bump above is the part that makes any of it reach
users. `release.yml` is idempotent by version, and `@aihu/compiler@1.1.0` is
already published pinning binaries at `0.1.27` / native `0.1.0`. Without a
version bump here, `publish-packages` prints "already published — skipping" and
the new pins never ship, exactly as happened for #552. Worth noting how far that
has already drifted: the registry carries `@aihu/compiler-darwin-arm64@0.1.28`
and `@aihu/compiler-native-darwin-arm64@0.1.0` while the repo had reached
`0.1.36` / `0.1.1` — nine in-repo bumps that never reached a consumer. The
published `0.1.0` addon predates the prefix-less template grammar, which is why
building this repo without `AIHU_COMPILE_BIN` still fails with retired
`C306: use $html={expr}` errors against source that is already correct.
