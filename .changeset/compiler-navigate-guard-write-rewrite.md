---
"@aihu/compiler": patch
---

Fix `beforeNavigate` / `afterNavigate` callbacks so writes to a
`let x = state(v)` binding take the state write-rewrite (`x = v` →
`__x_set(v)`), as they already do in every other imperative position.

`emit_state_macro_code` ran the spliced running-code through
`rewrite_wrapper_code` at eleven sites (`$computed`, `$action`, `$effect`,
`$lifecycle`/`onMount`, `$resource`, the `StateLet` initializer, the plain
body, …) but not in the two navigation-guard arms, which forwarded the
author's callback verbatim. The authored `x = …` therefore survived into the
emit and re-assigned the `const [x, __x_set] = signal(…)` destructuring
binding, so the bundle failed with:

```
[ILLEGAL_REASSIGNMENT] Unexpected re-assignment of const variable `path`
```

Latent since the state-model landed: the only in-repo consumer of
`afterNavigate` wrote no signals, so nothing on `main` ever tripped it. Any
component that syncs a `state` binding from a navigation guard — the natural
way to track `location.pathname` — hit it immediately.

With no wrapper-form declarations in a file the rewrite's target set is empty
and it early-returns, so OLD-dialect `$beforeNavigate` / `$afterNavigate`
files emit byte-identically.
