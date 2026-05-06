---
'@aihu/compiler': patch
---

Template-side reactivity for **explicit-signal** state references in
attribute bindings, `$if` conditions, and `$effect.on(...)` deps.

Previously, every attribute and `$if` cond went through a generic
`[() => (expr)]` thunk wrap. When `expr` was a simple identifier
referencing an explicit signal getter (`const [loading, setLoading] =
signal(true)`), the thunk evaluated to the getter *function*
(truthy/non-Signal-shaped), so:

- `class={view === 'week' ? 'active' : ''}` worked but
  `class={loading}` produced `[() => loading]` ⇒ runtime received the
  getter function as a thunk result, not the tracked value.
- `<div $if={loading}>` produced `[() => loading]` ⇒ `cond[0]()` returned
  the getter function (truthy), so the conditional was always true and
  never re-rendered when `loading` flipped.
- `$effect.on(activeTab) { ... }` emitted `effect(() => { activeTab; ... })`
  where `activeTab;` read the getter function reference and never
  registered the effect as a subscriber.

Fix:

- `lower_attr_expr`: when the expression is a simple identifier matching
  a registered signal, emit the signal tuple directly (`[name, setter]`
  for `signal()` or `[name]` for `computed`). arbor's `_applyAttrs`
  takes its reactive Path 2 with a real getter at `value[0]`.
- `$if` cond emission: same treatment — emit the signal tuple directly
  so `when()` receives a Signal-shaped argument and `cond[0]()` reads
  the tracked value.
- `$effect.on(name)` and `$watch`: when `name` is a simple signal
  identifier, emit `effect(() => { name(); body })` instead of
  `effect(() => { name; body })` so the read tracks.
- Also: `resolve_signals` now matches the TS-type-parameterized form
  `signal<T>(...)` (previously only `signal(...)` was recognized).

Surfaced by mail dogfooding: `inbox.fellwork.com/inbox` showed
`Loading…` indefinitely after a successful empty Supabase fetch.
Plain `let`-state still relies on the open follow-up of
class-property → signal lifting; this patch unblocks any page that
opts into explicit `signal()` declarations today.
