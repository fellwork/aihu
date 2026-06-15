---
"@aihu/compiler": patch
---

Fix repo-wide `TS2304: Cannot find name` errors in generated `.aihu.ts`
type-check sidecars. The sidecar emits `void (expr)` checks for every
`@template` expression, but since #129 (which stopped embedding the raw
`@state` script to avoid `TS1128` macro-syntax noise) it declared only the
framework globals — never the user's `@state` bindings. So any SFC whose
template read a `@state` const (`{label()}`, `$on.click={toggle}`, …) produced
a sidecar that failed `tsc`. The breakage was latent: it only surfaced when
sidecars were regenerated against a current compiler (hit across consuming
projects once that happened).

The generator now declares each `@state` binding **referenced by the template**
(signals, computeds, plain consts, and `$prop`/`$computed`/`$action`/`$resource`
collection names) as a parameter of `__aihu_template`, typed `any`. Parameters
rather than module-scope `declare const` so a binding that shadows a DOM global
(`open`, `close`, `name`, `status`, `location`, …) doesn't collide with
`lib.dom` (`TS2451`); only referenced names are emitted, so there are no unused
parameters. Precise per-binding typing remains a watched follow-up — `any` is
enough to resolve the reference while genuine template-shape errors still
surface. Verified end-to-end: a regenerated sidecar now passes
`tsc --noEmit --strict` with zero errors.
