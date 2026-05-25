# Verified prop read-form matrix (0.3.0, repro-backed)

Repro: compiled 4 micro-SFCs with `target/release/aihu-compile.exe` on main (canonical 0.3.0). Settles the spec-vs-emit read-form discrepancy.

## Declaration (canonical, collection form â€” inside @state)
`$prop: { name: { default: <value>, type?: "<TSannotation>" } }`
- Per-line form (`$prop name: T = d`) is REJECTED in v1 (migration error in state_macros.rs).
- Call form (`const x = $prop({...})`) is NOT valid â€” `$prop:` is a collection macro, not a call.
- `type:` carries the TS type; required when `default` can't carry it (optionals/unions). `default:` carries the value.

## Read-form (THE gotcha â€” context-dependent, NOT uniform)
| Context | Author writes | Compiler emits | Works? |
|---|---|---|---|
| `@template` expr | BARE `{title}` | `() => title()` (auto-called, reactive) | YES |
| `$computed`/`$action`/macro body | CALLED `() => count() * 2` | passes through verbatim; `$prop` binding precedes it | YES (must call; compiler does NOT auto-lower bare->call here; bare `count` = signal fn = NaN) |
| plain `@state` `const`/`let` | either | binding `const name = ctx.props.name` emitted AFTER plain_body | NO â€” TDZ ReferenceError (defect #3, unfixed) |

`props.name()` (runtime-internal form) is NOT the author surface â€” locals are bound as `name`.

## Consequence for migration
Prop-derived values written as plain `@state` consts MUST move to `$computed` (read the prop via `name()` there). Reading a prop directly in markup is bare. This is independent of compiler fix #1 (error-on-unknown-block) â€” applies to current published 0.3.0.
