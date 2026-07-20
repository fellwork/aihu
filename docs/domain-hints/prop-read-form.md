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
| plain `@state` `const`/`let` | either | binding `const name = ctx.props.name` emitted BEFORE plain_body | YES â€” **fixed** (see below) |

`props.name()` (runtime-internal form) is NOT the author surface â€” locals are bound as `name`.

### Correction: the plain-`@state` TDZ is FIXED (was "defect #3, unfixed")

This row previously read "NO â€” TDZ ReferenceError (defect #3, unfixed)". That is
stale. #279 hoisted the `$prop` bindings above `plain_body` (`emit.rs`), so the
prop getter is declared before any synchronously-running `@state` statement can
read it. Verified in the `cookbook/ssr-hydration.aihu` emit. The rest of the
matrix above still holds.

## Write-form (CO1, `fix/prop-write-rewrite`)

A `$prop` binding is a **callable getter carrying a `.set` writer**, not an
assignable variable. Authors may nonetheless write the natural form: inside
`$action`, `$lifecycle` and `$effect` bodies the compiler rewrites writes to
`.set(â€¦)`. Before CO1 these emitted assignment to a `const` and threw
`TypeError: Assignment to constant variable` on first interaction.

| Context | Author writes | Compiler emits | Works? |
|---|---|---|---|
| `$action` / `$lifecycle` / `$effect` | `count = 5` | `count.set(5)` | YES |
| â€¦ in expression position | `return count = 5` | `(count.set(5), count())` | YES (value preserved) |
| â€¦ compound | `count += n` | `count.set(count() + (n))` | YES |
| â€¦ logical | `count ??= 5` | `(count() ?? (count.set(5), count()))` | YES (short-circuit preserved) |
| â€¦ `++`/`--`, stmt position + numeric `default:` | `count++` | `count.set(count() + 1)` | YES (inline fast path) |
| â€¦ `++`/`--`, otherwise | `count++` | `__aihu_prop_upd(count, 1, false)` | YES (helper; `x++` is `ToNumeric(x) + 1`, not `x + 1`) |
| `$computed` / `$resource` | `count = 5` | **C561 compile error** | NO â€” a derivation must not mutate |
| any | `[count] = arr`, `for (count of â€¦)` | **C560 compile error** | NO â€” no sound desugar without a temporary |
| any | `count.foo = x` | unchanged + `W-prop-member-write` | writes a property on the getter *function* â€” almost certainly not what you meant |
| any | `count` shadowed by a param/local | unchanged | correct: the local is a plain variable |

**Reads are NOT rewritten.** `count()` and bare `count` pass through
byte-identical, including on the RHS of a rewritten write. So
`todos = [...todos, x]` becomes `todos.set([...todos, x])` â€” which is **still
broken**, because `...todos` spreads the getter function rather than the array.
Write `todos.set([...todos(), x])`. Fixing the bare-read form is a separate
slice; until then the read-form matrix above is the operative rule on both sides
of an assignment.

## Consequence for migration
Prop-derived values written as plain `@state` consts MUST move to `$computed` (read the prop via `name()` there). Reading a prop directly in markup is bare. This is independent of compiler fix #1 (error-on-unknown-block) â€” applies to current published 0.3.0.
