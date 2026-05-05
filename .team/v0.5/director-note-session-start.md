# Director Note — v0.5 Session Start

**Date:** 2026-05-03
**Version target:** v0.5 — Macro Elements
**State going in:** main at `c04c1e0`; Rust 163 tests, TS 483 tests, 8/8 size rows green

## Substance direction

v0.5 adds the five `<$element>` macro element boundaries. All five are **compiler-lowered** — helpers are emitted inline in the SFC's output JS, NOT as new runtime or arbor exports. Per Q10:D (Learning #36), the framework cost is ~5-15 B per boundary paid in user SFC JS, not in runtime/arbor bundles.

Single stream (Rust only): `feat/v0.5-macro-elements-compiler`

## Key constraints

- **No new arbor exports** — boundaries reuse `arbor.mount`, `arbor.when`, `arbor.slot`, `arbor.ErrorHandler`
- **No runtime size raise** — helpers are SFC-internal, not exported from `@aihu/runtime`
- **`<slot>` HTML form continues to parse** — same lowering as `<$slot>`, deprecated alias, removal at v1.0
- **`$action` form-attr** (from v0.4 deferral) is NOT part of v0.5 — stays deferred to v0.6
- **v0.5.5 `<$warp>` risk**: if `arbor.mount` can't accept an arbitrary host node, surface to user rather than adding new arbor surface

## Surface conditions

1. `<$warp>` can't be implemented without new arbor surface → surface to user
2. Any new arbor or runtime export needed → surface to user
3. Any size limit breach → surface
