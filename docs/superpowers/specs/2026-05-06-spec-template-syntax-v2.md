# Template Syntax v2 — `@template` redesign

**Status:** PROPOSED — not RATIFIED until user approves
**Spec version:** v2 (template-side)
**Date:** 2026-05-06
**Author:** Architect (round 1)
**Supersedes:** `2026-05-02-spec-template-attribute-syntax.md` (entirely; v1 directives are removed in this round)
**Related (NOT superseded):** `2026-05-05-spec-macro-vocabulary-v2.md`, `2026-05-05-spec-live-binding.md`, `2026-05-02-spec-block-structure.md`
**Migration mode:** HARD-CUT + codemod (matches macro-vocab-v2 precedent). New error code **C500**.
**IS-NOT-IN:** see §10. Reactivity runtime, `<$suspense>`/`<$shield>`/`<$guard>` family semantics, `@state`/`@agent` v2 grammar, `@route`, MCP/agent-binding protocol.

---

## §1 — Problem statement

The user's diagnosis is real: `@template` looks and feels like a different language than `@state` v2 because `@state` was harmonized on 2026-05-05 (macro-vocab-v2: object-literal collection-form, bare/wrapped duality, per-name `describe:` / `expose:`) while `@template` was left on the v1 attribute-directive surface. The visible asymmetry on `CalendarGrid.aihu` is structural (not stylistic): `$each="weekDays as day"` (quoted mini-grammar) sits next to `$key={day.toISOString()}` (curly expression) on the same element; long inline ternaries live inside attribute values; raw `this.dispatchEvent(new CustomEvent(...))` is the ONLY child→parent event path because no `$emit`-equivalent exists (Scout D3e — zero hits across all production source).

This round redesigns `@template` to pull it into the same conceptual frame as `@state` v2. The user's five non-negotiables are: **secure**, **typed**, **agentic-minded**, **human-formatted**, **light on boilerplate**. Plus **language-friendly** (no fight with TS lang-server, Biome, VS Code, Prettier).

The user has accepted this is breaking-change territory: **hard-cut + codemod** (Q2 answered). Out-of-repo userland (`mail/`, `pitch/`, etc.) gets patched post-merge by running the codemod (Q3). 62 in-repo `.aihu` files; ~166 directive sites (Scout D5). Migration scope is manageable.

Five concrete pre-existing gaps that this spec addresses: (a) `$ref` is parsed but silently dropped by codegen (Scout D1.1, 7 files use it; their refs do not work today); (b) `$bind:` curly form is silently accepted in violation of v1 spec §3.2; (c) `$action` on `<form>` is silently dropped by codegen; (d) deprecated `:prop=`/`@event=` warnings emit only to stderr; (e) `aihu.tmLanguage.json:145,154,163` regex is non-recursive and mis-tokenizes nested braces — a tooling cause of the "feels different" sensation. This spec disposes of each.

The Scout's **clean security floor** is load-bearing: zero string-to-code paths in any production aihu package (Scout D3c). The only DOM-injection vector is `$html`. We preserve and extend that floor; we do not weaken it.

---

## §2 — Reference SFC and side-by-side migration

The reference component is `c:\git\fellwork\mail\src\components\CalendarGrid.aihu` (51 lines, full source quoted in Scout D5.3). The relevant `@template` slice (v1):

```aihu
@template {
  <div class="calendar-grid">
    <div $if={view === 'week'} class="week-grid">
      <div $each="weekDays as day" $key={day.toISOString()} class="day-col">
        <h4 class="day-header">{day.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}</h4>
        <div
          $each="events.filter(e => new Date(e.start_at).toDateString() === day.toDateString()) as evt"
          $key={evt.id}
          class="event-chip"
        >
          <span class="event-time">{new Date(evt.start_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</span>
          <span class="event-title">{evt.title}</span>
        </div>
      </div>
    </div>
    <div $if={view === 'month'} class="month-grid">
      <div
        $each="monthCells as day"
        $key={day.toISOString()}
        class={'month-cell' + (day.getMonth() !== currentDate.getMonth() ? ' other-month' : '')}
        $on:click={() => { this.dispatchEvent(new CustomEvent('dayjump', { detail: day, bubbles: true })) }}
      >
        <span class="day-number">{day.getDate()}</span>
      </div>
    </div>
  </div>
}
```

Per-variant post-migration views are below in §3.x.6. Token counts are computed on the `@template` block only (excluding `@state`/`@events`).

**Reference numbers (v1, this file):** 26 non-empty template lines; 6 directive sites (`$if`×2, `$each`×3, `$key`×3, `$on:click`×1); 1 inline-ternary class; 1 raw-DOM event dispatch.

---

## §3 — Three named variants

### §3.A — Variant A — Harmonize-and-stay (attribute directives, normalized)

#### A.1 Sigil/syntax rules

Keep the `$<directive>` attribute family. Three pinned rules (resolves the v1 quoted-vs-curly visual asymmetry):

1. **Single-form rule per directive — curly is canonical.** Every value-bearing directive uses `={…}` curly form; quoted-identifier shortcut is removed except where the value IS structurally a string token (see rule 3). `$if={cond}`, `$show={cond}`, `$on.click={fn}`, `$bind.value={signal}`, `$key={expr}`. (Defense: Director §1's "asymmetry source" is the *mixed* form, not curly; Scout D5.3 #6 documents the real ergonomic gap from quoted-only handlers.)
2. **Dot, not colon.** `$on.click`, `$bind.value` — replace `:` with `.` for namespaced directives. (Defense: Scout D6.4 — colon-in-attribute-name fights HTML autocomplete and the embedded HTML grammar; Director §2.1 explicitly flagged this. Single-token form `$onclick=` was considered and rejected — destroys event-name extensibility for `$on.dragstart`, `$on.pointerover`.)
3. **Iteration is the one structural exception.** `$for` (renamed from `$each` to align with English-pronounceable `for…of`) accepts a structured-token quoted form: `$for="<expr> as <item>[, <idx>] [(<key-expr>)]"`. The LHS roundtrips parens, dots, calls, lambdas (Scout's hidden landmine — `parse_each_value` already permits this; v2 lifts the bypass into the spec). Optional `(key)` parenthesized after `as`-clause folds the v1 `$key=` into the same directive — one site, not two. (Defense: this is a deliberate one-keyword carve-out for the iteration mini-grammar, mirroring Svelte's `{#each xs as x (x.id)}`; the rest of the surface is curly.)

Boolean directives (`$once`, `$raw`) are unchanged. `$memo={deps}` keeps curly. `$html={expr}` is renamed `$html.unsafe={expr}` (security signal in the name; see §6).

**Class/style shortcuts** (lifts the screenshot's inline ternary):

```
class={['month-cell', day.getMonth() !== currentDate.getMonth() && 'other-month']}
```

Plain attribute binding `class={…}` accepts a string OR an array of `(string | false | null | undefined)`; runtime joins truthy entries with space. Mirrors Solid/clsx idiom; LLM-familiar. No new sigil. Style accepts an object form `style={{ color: 'red' }}`.

#### A.2 `$emit` integration

Listen-side: `$on.<event>={handler}` works for both DOM events and component events (one syntax). Emit-side: §5.

#### A.3 `$ref` disposition — FIXED THIS ROUND

`$ref={localBinding}` lowers to a local `let` write at mount; the ref is a writable signal-tuple containing the element. This closes Scout's pre-existing bug. Codegen adds the `"ref"` arm in `emit_macro_effects` (Builder work).

#### A.4 Reactivity preserved

`class={…}` continues to flow `parser → Attr::Binding → codegen tuple → runtime _applyAttrs → mountEffect + setAttribute`. `$on.click={fn}` lowers to the existing `addEventListener` path. Per-attribute `mountEffect` semantics unchanged. Cite Scout D2; this variant is **purely syntactic** at the codegen layer — no runtime contract change.

#### A.5 Tokens-per-construct

| Construct | v1 | v2-A |
|---|---|---|
| Conditional | `$if={x}` | `$if={x}` |
| List+key | `$each="xs as x" $key={x.id}` | `$for="xs as x (x.id)"` |
| Event | `$on:click={fn}` | `$on.click={fn}` |
| Bind | `$bind:value="sig"` | `$bind.value={sig}` |
| Class+condition | `class={'a' + (cond ? ' b' : '')}` | `class={['a', cond && 'b']}` |

#### A.6 Post-migration CalendarGrid

```aihu
@template {
  <div class="calendar-grid">
    <div $if={view === 'week'} class="week-grid">
      <div $for="weekDays as day (day.toISOString())" class="day-col">
        <h4 class="day-header">{day.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}</h4>
        <div
          $for="events.filter(e => new Date(e.start_at).toDateString() === day.toDateString()) as evt (evt.id)"
          class="event-chip"
        >
          <span class="event-time">{new Date(evt.start_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</span>
          <span class="event-title">{evt.title}</span>
        </div>
      </div>
    </div>
    <div $if={view === 'month'} class="month-grid">
      <div
        $for="monthCells as day (day.toISOString())"
        class={['month-cell', day.getMonth() !== currentDate.getMonth() && 'other-month']}
        $on.click={() => $emit.dayjump({ day })}
      >
        <span class="day-number">{day.getDate()}</span>
      </div>
    </div>
  </div>
}
```

**Counts:** 24 non-empty lines (-2); directive sites drop 6→4 (`$key` folded into `$for`); inline-ternary lift saves ~30 chars; raw-DOM dispatch replaced.

#### A.7 Shape

Smallest-possible delta from v1. Same conceptual model (attribute directives), three pinned rules (curly-canonical, dot-not-colon, `$for`-with-key-fold). Lowest migration cost; lowest cognitive ceiling for novel users.

### §3.B — Variant B — Block-tag control flow

#### B.1 Sigil/syntax rules

Lift control-flow OUT of attribute position into block tags. Binding directives stay attribute-form (well-understood; cite Director §2.6).

```
{#if cond}…{:else if cond}…{:else}…{/if}
{#for items as item, i (key)}…{:empty}…{/for}
```

Svelte-flavored. `{:else}` and `{:else if}` are the in-block sibling form; Director's brief asked for justification — accepted because they avoid closing/reopening the `#if` (one block, multiple branches). `{:empty}` covers v1's missing fallback-when-empty case in iteration.

Binding directives keep attribute form: `$on.click={fn}`, `$bind.value={sig}`, `$key` is folded into `{#for}` head. Drops the `$if`/`$each` attribute directives entirely (the visual asymmetry source).

`$html.unsafe={expr}` becomes `{@html expr}` (Svelte-style; explicit `@` warning sigil at the call site, not the directive name).

`$ref={…}` stays attribute-form (FIXED this round; same lowering as Variant A).

#### B.2 `$emit` integration — same as §5.

#### B.3 `$ref` — fixed (attribute form).

#### B.4 Reactivity

Block-tag forms compile to the same `createIfBoundary` / `each` runtime calls as v1. The compiler's structural lowering is renamed to consume block-tag AST nodes; runtime is unchanged. Per-attribute `mountEffect` for bindings is preserved.

#### B.5 Tokens-per-construct

| Construct | v1 | v2-B |
|---|---|---|
| Conditional w/ else | `<div $if={x}>…</div><div $if={!x}>…</div>` | `{#if x}…{:else}…{/if}` |
| List+key+empty | `$each="xs as x" $key={x.id}` + manual empty check | `{#for xs as x (x.id)}…{:empty}…{/for}` |
| Event | `$on:click={fn}` | `$on.click={fn}` |
| Bind | `$bind:value="sig"` | `$bind.value={sig}` |

#### B.6 Post-migration CalendarGrid

```aihu
@template {
  <div class="calendar-grid">
    {#if view === 'week'}
      <div class="week-grid">
        {#for weekDays as day (day.toISOString())}
          <div class="day-col">
            <h4 class="day-header">{day.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}</h4>
            {#for events.filter(e => new Date(e.start_at).toDateString() === day.toDateString()) as evt (evt.id)}
              <div class="event-chip">
                <span class="event-time">{new Date(evt.start_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</span>
                <span class="event-title">{evt.title}</span>
              </div>
            {/for}
          </div>
        {/for}
      </div>
    {:else if view === 'month'}
      <div class="month-grid">
        {#for monthCells as day (day.toISOString())}
          <div
            class={['month-cell', day.getMonth() !== currentDate.getMonth() && 'other-month']}
            $on.click={() => $emit.dayjump({ day })}
          >
            <span class="day-number">{day.getDate()}</span>
          </div>
        {/for}
      </div>
    {/if}
  </div>
}
```

**Counts:** 23 non-empty lines (-3); `{:else if}` collapses two `$if` siblings; `{/for}` adds closing tags (the cost). Most readable for cold readers per Angular's @if/@for migration evidence (Director §3).

#### B.7 Shape

Strongest precedent (Angular, Svelte). Block-tag separates *structural* directives from *binding* directives — visibly pulls structure out of HTML attributes where it never belonged. Highest migration cost (new tokens, indentation, closing tags). Best long-term ergonomic floor.

### §3.C — Variant C — Structural component pattern

#### C.1 Sigil/syntax rules

Lift control-flow into the existing `<$slot>`/`<$suspense>`/`<$shield>`/`<$guard>` family. New macro elements `<$if>`, `<$else>`, `<$for>` join `<$liveRegion>`/`<$skipLink>`/`<$focusTrap>`/`<$router>`/`<$link>` (Scout D1.3 — eight macro-elements already exist beyond the v1 spec; this variant is the most consistent with that reality).

```
<$if cond={x}>…</$if>
<$if cond={x}>…<$else />…</$if>      ← single sibling element
<$for each={xs} as="item" key={(x) => x.id}>…</$for>
```

`<$for>`'s child template is the implicit single-child contents — same convention as `<$slot>`. The `as=` attribute binds the iteration variable name (string, parser-validated identifier); `key={fn}` is a key-extractor function (curly).

Binding directives stay attribute-form: `$on.click={fn}`, `$bind.value={sig}`, `$key={…}` is replaced by `<$for>`'s `key=` attribute (consistent with the rest of the family).

`$html.unsafe={expr}` becomes `<$html unsafe>{expr}</$html>` (explicit element + attribute mark).

#### C.2 `$emit` — same as §5.

#### C.3 `$ref` — fixed (attribute form).

#### C.4 Reactivity

`<$if>` lowers to existing `createIfBoundary`. `<$for>`'s `each={xs}` is the iterable expression; `key={fn}` is the key-extractor; the implicit child template becomes the iteration body. No runtime contract change.

#### C.5 Tokens-per-construct

| Construct | v1 | v2-C |
|---|---|---|
| Conditional w/ else | `$if={x}` + sibling `$if={!x}` | `<$if cond={x}>…<$else />…</$if>` |
| List+key | `$each="xs as x" $key={x.id}` | `<$for each={xs} as="x" key={(x) => x.id}>…</$for>` |
| Event | `$on:click={fn}` | `$on.click={fn}` |

#### C.6 Post-migration CalendarGrid

```aihu
@template {
  <div class="calendar-grid">
    <$if cond={view === 'week'}>
      <div class="week-grid">
        <$for each={weekDays} as="day" key={(d) => d.toISOString()}>
          <div class="day-col">
            <h4 class="day-header">{day.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}</h4>
            <$for each={events.filter(e => new Date(e.start_at).toDateString() === day.toDateString())} as="evt" key={(e) => e.id}>
              <div class="event-chip">
                <span class="event-time">{new Date(evt.start_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</span>
                <span class="event-title">{evt.title}</span>
              </div>
            </$for>
          </div>
        </$for>
      </div>
    </$if>
    <$if cond={view === 'month'}>
      <div class="month-grid">
        <$for each={monthCells} as="day" key={(d) => d.toISOString()}>
          <div
            class={['month-cell', day.getMonth() !== currentDate.getMonth() && 'other-month']}
            $on.click={() => $emit.dayjump({ day })}
          >
            <span class="day-number">{day.getDate()}</span>
          </div>
        </$for>
      </div>
    </$if>
  </div>
}
```

**Counts:** 25 non-empty lines (-1); structurally consistent with `<$suspense>`/`<$shield>` (no conceptual seam between control and boundary primitives).

#### C.7 Shape

Conceptually cleanest (one tag-form for all structural primitives), but verbose at call sites (Solid's experience: `<For>`/`<Show>` add closing tags everywhere). The `key={fn}` form is more typed than Variant A/B's bare `key={expr}` — the extractor-function shape lets tsc check the input type.

---

## §4 — Evaluation matrix

Scored 1–5 (5 = best). FROM-baselines stated where measurable.

| Criterion | A | B | C | Notes |
|---|---|---|---|---|
| Secure | 5 | 5 | 5 | All three preserve `setAttribute` auto-escape (Scout D3b); all rename `$html` to add a security signal at the call site; clean string-to-code floor unchanged (Scout D3c). |
| Typed | 3 | 4 | 5 | C's `key={(x) => x.id}` extractor is a typed function; A/B's `(x.id)` parenthetical is a TS expression in iteration scope. All three flow curly attrs through tsc via §7 path (i). |
| Agentic-minded | 4 | 5 | 4 | LLM cold-write: `{#if}`/`{#for}` is dense in training data (Svelte/Angular). A's `$on.click` is novel. C's nested `<$for>`s are JSX-shaped (Solid) — also strong. |
| Human-formatted | 3 | 5 | 4 | B's block-tag form pulls structure out of attribute-rats-nest most decisively. A's class-array lifts the screenshot's biggest pain. C's tag-soup at deep nesting hurts readability. |
| Light boilerplate | 5 | 3 | 2 | Tokens-per-construct: A wins (smallest delta); B adds `{/for}` closers; C adds `<$for>`/`</$for>` per loop. |
| Migration cost | 5 | 2 | 3 | A: regex-style pass (curly-ify, colon→dot, fold `$key`). B: AST transform — must lift attribute directive scopes into block-tag scopes. C: AST transform — wrap subtrees in `<$if>`/`<$for>`, rename `$key=` to `key=`. |
| Codemod complexity | 5 | 2 | 3 | A: ~150 LOC. B: ~280 LOC. C: ~220 LOC. All within the 300-LOC v2 budget. |

**Architect's recommendation: Variant A (harmonize-and-stay).** Director's test was: "find the smallest set of targeted changes that pulls `@template` into the same conceptual frame as `@state` v2." `@state` v2 is *also* attribute-shaped (`$prop:`, `$action:`, `$computed:` at block-internal positions). Variant A pulls `@template` into the same frame — one curly form, one dot-namespace, one folded-key iteration — without inventing a new structural surface. Variants B and C each invent new surfaces (block tags, structural tags) that solve problems Director already flagged but at higher migration cost AND a wider conceptual gap from `@state`'s attribute-shape. A also addresses every concrete v1 gap (curly-vs-quoted, colon-in-attr-name, inline-ternary lift, `$ref` fix) inside one round.

The real escape hatch (`$html.unsafe`-rename, `$emit` design, `$ref` fix, type-safety strategy) is shared across all three; A reaches it with the lightest variant cost.

---

## §5 — `$emit` design

**Primary recommendation:** declarative on the existing v2 `@state` collection-form via a new macro-collection `$event`.

### §5.a Declaration site

```aihu
@state {
  $event: {
    dayjump: { payload: { day: Date }, describe: 'User picked a day cell.' },
    rangechange: { payload: { start: Date, end: Date } },
  }
}
```

`$event` joins the v2 collection-form family (`$prop`, `$computed`, `$action`, `$resource`, `$effect`, `$lifecycle`, `$event`). Wrapped form only (forbidden bare). Required key: `payload` (a TS type literal). Optional: `describe`, `bubbles?: boolean = true`, `composed?: boolean = false`. **Defense:** reuses the v2 collection-form pattern; per-name typed payloads; agent-readable via `describe:` exactly like `$prop`.

Rejected alternatives: (i) extending `@expose` — `@expose` is parent→child read/write; events are child→parent. Wrong direction. (ii) New `@events` block — unnecessary new top-level surface; v2 already harmonized everything else as `@state`-collection. (iii) Anonymous `$emit('name', …)` with no declaration — fails the **typed** non-negotiable.

### §5.b Emit call site

Inside any `@template` event handler or `@state` action:

```aihu
$on.click={() => $emit.dayjump({ day })}
```

`$emit.<name>(payload)` — the global `$emit` is a per-name dispatcher proxy. Compiler resolves `$emit.dayjump` against the `$event` collection at compile time; missing names error with C501.

### §5.c Listen site

```aihu
<CalendarGrid $on.dayjump={({ day }) => focusDate(day)} />
```

Listening uses the same `$on.<event>` directive form as DOM events (Variant A/B/C all share this). The compiler distinguishes DOM-vs-component events at type-resolution time: if `<Tag>` declares `dayjump` in `$event`, the listener gets the typed payload; otherwise the listener treats it as a DOM event. **Defense:** one syntax for both — agent-pleasant, no new sigil. Avoids Vue's `@`/`v-on:` split.

### §5.d Type flow

The compiler emits a synthetic `.aihu.d.ts` companion file per SFC that contains `$event` interfaces. Parent's `<CalendarGrid>` resolves component type → reads `$event` map → typed payload threads into the listener's destructure pattern. (Path (i) of §7. Same pipeline as `$prop` typing.)

### §5.e Bubbling / cancelation

`$emit` lowers to `dispatchEvent(new CustomEvent(name, { detail: payload, bubbles, composed, cancelable: true }))` on the host element. Mirrors DOM `CustomEvent`; `event.preventDefault()` works. **Defense:** preserves the platform model; agents and humans understand DOM events. A simpler "parent-passes-callback-prop" model was considered and rejected — props for events double the surface (`onDayjump` prop + `dayjump` event) and bypass the natural bubbling chain.

### §5.f Backward-compat with raw DOM events

`addEventListener` on the host element still works. `$emit` produces real `CustomEvent`s — third-party code listening at the DOM level continues to function. The only newly-rejected pattern is `this.dispatchEvent(new CustomEvent(...))` inside SFC handler bodies — codemod rewrites it; raw DOM dispatch from outside the SFC is unaffected.

---

## §6 — Security model

**Floor:** Scout D3c — zero string-to-code paths in any production package. We preserve and tighten.

- **Auto-escape default.** `setAttribute(key, String(value))` path in `_applyAttrs` is unchanged (Scout D3b). All three variants preserve this. **Non-negotiable.**
- **`$html` rename to mark unsafety.** Variant A: `$html.unsafe={expr}`. B: `{@html expr}`. C: `<$html unsafe>{expr}</$html>`. Sigil-level renaming makes the unsafe operation visible at the call site (today's `$html=` does not).
- **Sanitizer interface.** Add an opt-in `aihu.config.ts` field `templates.htmlSanitizer?: (raw: string) => string` (default: identity). When configured, the runtime calls it before assigning innerHTML. **Default remains no-op** (do not silently invent a "safe-by-default" claim that depends on userland providing DOMPurify). Userland projects opt in by writing the sanitizer.
- **Trusted Types.** No CSP-trusted-types integration in this round (deferred — §12). Document that `$html.unsafe` violates CSP `require-trusted-types-for 'script'` and direct users to the sanitizer hook.
- **Event-handler trust.** Document explicitly: handler bodies execute in the SFC's module scope; framework provides no isolation. **`.aihu` source from untrusted authors is NOT a supported use-case.** This matches React/Vue/Solid and the existing reality (Scout D3d).
- **`$emit` payload trust.** Payloads are typed but not sanitized; userland responsibility on both sides. Document.
- **Codegen hardening — silent-drop fix.** Replace the `_ => {}` default arm in `emit_macro_effects` (Scout D1.4) with an exhaustiveness check that errors C500 ("unknown directive `$<name>`"). Closes Risk-7 from Scout D7.

---

## §7 — Type-safety strategy

**FROM:** ≈0% of `@template` content is tsc-checked at the lang-server level (Scout D4). `arch-4-dx-tools.md:28` admits the gap.

**TO target:** every curly attribute expression and every text interpolation in `@template` is checked by tsc within the SFC's `@state` scope. Quoted-identifier resolution against `@state` symbol table is enforced at compile time, not runtime.

**Recommended path: (i) Generated `.aihu.ts` companion file.**

The compiler emits a sidecar `<file>.aihu.ts` per `.aihu` source. The sidecar contains a single function with the SFC's `@state` declarations in scope, and every template expression as a typed body statement. Example (sketch):

```ts
// CalendarGrid.aihu.ts (generated)
declare function __template(props: CalendarGridProps): void {
  const { events, view, currentDate } = props
  const weekDays: Date[] = /* generated from $computed */
  // expressions lifted from @template:
  ;(view === 'week') satisfies boolean
  ;(day.toISOString()) satisfies string
  ;(class_value([class_value('month-cell'), day.getMonth() !== currentDate.getMonth() && 'other-month'])) satisfies string
  // …
}
```

`tsc --noEmit` over `**/*.aihu.ts` — CI enforced. No tsserver plugin required to ship.

**Defense:** lowest-effort, highest-coverage. Path (ii) (Volar-style tsserver plugin) is correct long-term but is `arch-4-dx-tools` territory and gates on more work than this round can fund. Path (iii) (rely on the compiled `.ts` output going through tsc) is what nominally happens today and is empirically failing (Scout D4).

The Builder may stub path (i) initially — emit the sidecar with the most common forms (curly attrs, text interpolation, event handlers) and grow coverage with hard-cut acceptance bars (§11).

**Per-form coverage matrix:**

| Form | v1 (FROM) | v2 (TO via path (i)) |
|---|---|---|
| `class={expr}` | runtime only | tsc compile-time |
| `$on.click={fn}` (curly) | runtime only | tsc compile-time |
| `$on.click={fnName}` reference | runtime only | tsc compile-time |
| `$bind.value={signal}` | runtime only (writability unverified) | tsc compile-time + writability check on signal type |
| Text interpolation `{expr}` | runtime only | tsc compile-time |
| `$for="xs as x (k)"` LHS | runtime only | tsc compile-time (LHS is parsed expr, sidecar inlines it) |
| Component prop `<UserCard user={u}>` | not cross-checked | tsc compile-time against `UserCard` props type |
| `$emit.<name>(payload)` | n/a (new) | tsc compile-time against `$event` declaration |

---

## §8 — Reactivity-binding model preserved (non-goal callout)

**Explicit non-goal.** This spec does NOT change:
- The `@aihu/signals` runtime
- The `@aihu/arbor` runtime, including `_applyAttrs`, `mountEffect`, `branch`, `materialize` (Scout D2)
- The `<$suspense>`/`<$shield>`/`<$guard>` boundary primitives
- The split-bundle compilation contract (Block Structure Spec §11.5)
- The `@agent` block lowering, `__agentBinding` shape, or `componentInstanceRegistry` (live-binding spec)

Compiler emit changes are syntactic. The runtime contract is untouched. `class={signal}` continues to flow `parser → Attr::Binding → runtime tuple → mountEffect + setAttribute` per Scout D2; `$for` lowers to existing `each(...)` / `createEachBoundary(...)`; `$if` lowers to `createIfBoundary(...)`; `$on.click` lowers to `addEventListener(...)`. Builder MUST NOT drift into runtime changes.

---

## §9 — Codemod sketch

Target path: **`packages/compiler/js/codemods/template-syntax/migrate.ts`** (note `js/` per Scout's correction). Error code **C500** — reserve in Compiler Error Reference. Budget: **300 LOC** (matches v2 precedent). Follows the macro-vocab-v2 codemod's brace-balanced, comment-aware string-walking shape.

### Inputs

v1 `.aihu` source text (NOT pre-parsed AST — robustness against external-repo formatting variance per user Q3). Operates on the `@template` block found via `findBlock(source, 'template')` (reuse existing `findBlock` from macro-vocab-v2 codemod).

### Passes (recommended Variant A; B and C would extend)

1. **`colonToDot`** — `$on:<event>=` → `$on.<event>=`; `$bind:<prop>=` → `$bind.<prop>=`. Regex-safe within attribute-key positions.
2. **`quotedToCurly`** — for each directive that v2 makes curly-canonical (`$if`, `$show`, `$key`, `$on.<event>`, `$bind.<prop>`): if value is `"identifier"` or `"a.b.c"`, rewrite to `={identifier}` / `={a.b.c}`. Quoted strings that look like literal text (whitespace, special chars) are left as-is. Whitelist of identifier-shape identifiers via Scout's `validate_macro_quoted_value` regex.
3. **`foldEachKey`** — for each element with both `$each="…"` and `$key={expr}`: rewrite to `$for="<list> as <item>[, <idx>] (<key-expr>)"`. Round-trips parens, dots, lambdas in list LHS (Scout D5.3 hidden landmine — this is the `$for` round-trip risk; surface a warning if LHS contains constructs the parser cannot re-tokenize). Codemod fail-soft: when uncertain, leave the input as-is and warn.
4. **`renameEachToFor`** — `$each="…"` (no `$key`) → `$for="…"`.
5. **`renameHtml`** — `$html=` → `$html.unsafe=`.
6. **`liftInlineDispatch`** — pattern-match `() => { this.dispatchEvent(new CustomEvent('<name>', { detail: <payload> })) }` and rewrite to `() => $emit.<name>(<payload>)`. Surfaces a warning to add `$event: { <name>: { payload: <type> } }` to `@state` (codemod also patches the `@state` block when the emission name is unique; otherwise warns — author hand-finishes).
7. **`liftClassTernary`** — pattern-match `class={'<a>' + (<cond> ? ' <b>' : '')}` (and the `'<a> ' + ...` whitespace variant) → `class={['<a>', <cond> && '<b>']}`. Conservative pattern; complex ternaries fall through unchanged.
8. **`fixRefStub`** — note: `$ref={…}` parsing was already accepted; codegen support lands as a Builder change, not a codemod transformation. Codemod is no-op for `$ref`.
9. **`fixBindCurlyDrift`** — `$bind.<prop>={ident}` → `$bind.<prop>={ident}` (no-op; spec drift Scout flagged is now legalized). The OLD `$bind:<prop>="ident"` quoted form is converted via pass (1)+(2) to curly.

### Outputs

Variant A `.aihu` text. Comments preserved (block + line). Whitespace preserved within attribute lines. Element re-indentation deferred to Biome/Prettier (out of codemod scope).

### Round-trip risk

- `$for` LHS containing `as` substrings inside string literals or template-literal expressions — codemod tokenizes by skipping strings (cite the macro-vocab-v2 codemod's `skipString` helper). If detection fails, codemod leaves input unchanged and emits a warning.
- `$on.click={() => { /* multi-statement body with this.dispatchEvent INSIDE conditionals */ }}` — codemod's `liftInlineDispatch` pattern-matches the canonical shape only. Conditional/nested dispatch falls through; warning emitted; author rewrites by hand.
- v1-spec-drift cases (`$bind:value={curly}`, `$memo="quoted"`) — codemod legalizes (curly is now canonical for `$bind.value`); `$memo="…"` quoted form converts via pass (2) to `$memo={…}`.

### Test corpus

- All 62 in-aihu-repo `.aihu` files round-trip; emitted output `cargo check`'s clean.
- `CalendarGrid.aihu` (cross-repo reference) round-trips green.
- One synthetic edge-case fixture: `$each="x.filter(p => p && q.r) as item"` (the hidden landmine) round-trips green to `$for="x.filter(p => p && q.r) as item"`.
- One synthetic fixture for `liftInlineDispatch` hitting all three branches: simple, with-payload-object, with-bubbles-flag.

The codemod is delivered as Builder work. Architect estimates 150 LOC for Variant A passes 1-7; +50 LOC for warning surface + idempotency self-check; well under the 300 LOC budget.

---

## §10 — IS-NOT-IN list

Reserved entries — out of scope this round:

- `@state` block format (v2 settled — `2026-05-05-spec-macro-vocabulary-v2.md`)
- `@agent` block (v2 settled)
- `@expose` semantics (referenced by `$emit` declaration but not redesigned)
- `@route` block
- MCP / agent-binding protocol (live-binding spec, separate)
- `@aihu/signals` runtime (signal/effect contract)
- `@aihu/arbor` boundary primitives (`<$suspense>`, `<$shield>`, `<$guard>`, `<$slot>`, `<$warp>`)
- `<$liveRegion>`, `<$skipLink>`, `<$focusTrap>`, `<$router>`, `<$link>`, `<$navigate>` (arch-5 macro-elements; preserved verbatim)
- VS Code tsserver plugin (arch-4 territory; this spec recommends path (i) sidecar but does not gate on tsserver plugin work)
- A2A/ACP protocol surfaces
- `aihu.tmLanguage.json` grammar update — recommended to land paired with this spec but not specified here (Builder coordinates with tooling)
- `@style` block (no changes; styles remain CSS + `$reactive`/`$when` macros)
- Trusted Types CSP integration (deferred — §12)

---

## §11 — Acceptance criteria

Builder MUST run these. All gates are runnable.

a. **Codemod corpus.** `migrate.ts` round-trips all 62 in-aihu-repo `.aihu` files; emitted output `cargo check --workspace` exits 0; no warnings beyond the v2-collection-form residual cases already tracked.

b. **CalendarGrid token reduction.** Post-migration `CalendarGrid.aihu` `@template`-block non-empty line count drops from 26 → 24 or fewer (-7.7% — Variant A's measured number). Directive-call-sites drop from 6 → 4 (`$key` folded into `$for`). Inline-ternary class is replaced by class-array form. No raw `this.dispatchEvent`.

c. **TS coverage.** Per §7 path (i): for `CalendarGrid.aihu`, the generated `.aihu.ts` sidecar produces a `tsc --noEmit` error when any curly-attribute expression is given a wrong-typed expression. Concretely: replacing `$on.click={() => $emit.dayjump({ day })}` with `$emit.dayjump({ day: 'oops' })` (string instead of Date) MUST surface a tsc error.

d. **`$emit` typed payload.** Parent component receiving `<CalendarGrid $on.dayjump={({ day }: { day: string }) => …}>` MUST surface a tsc error (`day` is `Date` per `$event` declaration).

e. **Backward-compat snapshot.** `aihu app` legacy snapshot test (per arch-6 §7.3 precedent) round-trips identical bytes when the codemod is a no-op (e.g., already-migrated files).

f. **`$bind` curly-drift legalization.** v1 source containing `$bind:value={signal}` (the spec-drift case) is migrated by passes (1)+(9) to `$bind.value={signal}` and is accepted by the new parser. v1 source containing `$bind:value="signal"` is migrated by passes (1)+(2) to `$bind.value={signal}`.

g. **Silent-drop closure.** New parser/codegen errors C500 on any unknown `$<name>` directive (closes Scout Risk-7). Test fixture: `<div $unknownDir={x}>` MUST error C500 at build.

h. **`$ref` lands.** `$ref={localBinding}` lowers correctly: refs work for the first time. Test fixture asserts `localBinding()` returns the element node post-mount.

i. **Hidden-landmine round-trip.** Synthetic fixture with `$each="events.filter(e => ...) as evt" $key={evt.id}` migrates to `$for="events.filter(e => ...) as evt (evt.id)"` and `cargo check`'s clean.

---

## §12 — Open questions for next-round Director

1. **Sanitizer interface default.** Should `aihu.config.ts` `templates.htmlSanitizer` default to a bundled DOMPurify wrapper, or remain identity (current proposal)? Bundling adds 25KB to default builds; identity keeps the dep-free thesis.
2. **Codemod CLI surface.** Standalone (`npx @aihu/codemods/template-syntax <glob>`) or `aihu codemod template-syntax <glob>` subcommand? Aligns with macro-vocab-v2 codemod once that ships; needs Director adjudication on naming.
3. **`$ref` disposition — fix here, or split into a separate spec?** Currently §3.A.3, §11.h: fix THIS round (closes a pre-existing bug with no migration cost). Defer-option exists; this spec recommends fix.
4. **TextMate grammar update.** Does the `aihu.tmLanguage.json` regex update (Scout D6.2 — non-recursive `\{[^}]*\}`) ride this spec's PR, or does it ship in a paired devex round? Recommend paired devex round since the tooling team can land it independently.
5. **Trusted Types integration** — defer to v0.4 or include now? Current proposal: defer; document the CSP incompatibility of `$html.unsafe`.

---

*End of Template Syntax v2 spec — 2026-05-06.*
