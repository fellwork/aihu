---
'@aihu/compiler': patch
---

Fix a live, currently-shipping crash for `$aria`-only server components, and
give `$form`-only components a standalone SSR entry.

An independent review of the previous SSR-entry fix (`@action`-only
components now reach the no-DOM SSR shape) surfaced a deeper, pre-existing bug
in the same family: `$aria`/`$form`'s `ElementInternals` wiring
(`INTERNALS_GUARD` and every per-entry statement — `setFormValue`,
`setValidity`, every `aria-*` IDL property, `describedBy`, the auto
keyboard-promotion listener) read `ctx.element._internals`
**unconditionally**. The host-less SSR `SetupContext` passes `element: null`
by design — a server render never mounts, so there is nothing to attach
`ElementInternals` to.

**This was already live.** `$aria` alone never gated the SSR-entry decision,
so any component combining `$aria` with a plain `$action`/`$prop` already
reached the SSR entry and crashed the instant its setup body ran — not merely
failed to construct. Reproduced and fixed independent of anything else in this
release: `TypeError: Cannot read properties of null (reading '_internals')`,
verified via a real built Cloudflare Worker before the fix, confirmed clean
after.

`$form` had the opposite problem: a dedicated code branch emitted it
unconditionally in the client-only shape, with no SSR-entry logic at all,
regardless of the `emit_ssr_entry`/`ssr_standalone` gates. A plain
`$form`-only component (no props/agent-inputs/`$extends`) never got
`export const __ssr`.

Fixed both: every `_internals`-touching statement is now guarded on
`__aihu_el` (a no-op under host-less SSR, unchanged behavior with a real
host); `$form`-only components now join the `ssr_standalone` SSR-entry branch,
with `{ formAssociated: true }` still threaded onto the client-side guarded
`defineElement` call, which previously received `define_opts` in that branch
and the plain fallback branch not at all — dead code until now, since `$form`
was the only source of a non-empty `define_opts` and could never reach either
branch before.

**Deliberately still excluded**, and now documented rather than left to look
like an oversight:
- `$form` combined with `$prop`/agent-inputs/`$extends` — `define_opts` is not
  yet threaded through that branch.
- `$extends` (`base:`) — the imported base-class module does
  `class extends HTMLElement` at ITS OWN top level, outside this compiler's
  reach; fixing it needs every extended primitive in `@aihu/primitives` to
  guard its own module-scope class declaration, not a compiler-only change.
- `@agent` blocks with `$input` declarations — unchanged from the previous
  fix; `ctx.attrs.<name>[0]()` still has no host-less stub.

Verified end-to-end, not just by string-content assertion: a real scaffolded
`output: 'ssr'` app with a `$form` + `$aria` component referenced as a CHILD,
driven through a real built Worker. Before: the crash above, silently caught
by `__aihu_schild`'s fail-closed handling — the page still returned 200, with
the component simply missing and no visible error. After: the component's
content renders correctly. Six Rust tests pin the structural shape, three of
them counterfactual-verified against a version with every guard stripped.
