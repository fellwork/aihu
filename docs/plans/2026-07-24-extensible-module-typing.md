# Extensible Module Typing

**Date:** 2026-07-24
**Status:** DRAFT — capturing a design intent that exists nowhere in the written record.
Not ratified. No founder rulings yet.
**Scope:** the user-facing TypeScript surface of `@aihu/runtime`, `@aihu/compiler`
(strict-templates sidecar), `@aihu/plugin`, `@aihu/context`, `@aihu/store`, and
`@aihu/use`.
**Depends on / extends:** [`state-model/40-spec.md`](./state-model/40-spec.md)
(the wrapper dialect's typed config surface — `prop<T>`, `action<F>`, `derived`)
and the strict-templates sidecar work (#486), which is where the typing that
would be extended actually lives.

## Why this doc exists

The idea — *type-fest-inspired extensibility, so the typing built into the
modules can be extended by consumers* — was discussed but **never written down**.
Verified absent from:

- the repo: `type-fest` appears only in `bun.lock`, purely transitive (`dot-prop`,
  `hasha`, `read-pkg`, `ansi-escapes`). No `package.json` declares it.
- `docs/` — no plan, spec, or architecture note mentions it, by name or by the
  concept vocabulary (`mapped type`, `conditional type`, `utility type`,
  `higher-kinded`).
- the documented prior-art influences, which are Tailwind v4 (css-engine),
  ProseMirror's DOMObserver (editor), VueUse/reactuse (`@aihu/use`), and Solid +
  Vue (`@aihu/reactive`). No TypeScript-library influence is recorded anywhere.
- GBrain. **Caveat: this is weak evidence.** GBrain's most recent page is
  `2026-06-05` and it contains none of the July work at all — no `@aihu/use`, no
  deep-reactivity, no state-model migration. Its semantic `query` path also
  currently returns empty for every input; only keyword search functions. Absence
  there is uninformative for anything after early June.

So this is a reconstruction of intent, not a transcription. **Treat every
specific below as a proposal to be corrected, not as a recovered decision.**

## The idea

`type-fest` is not interesting here as a dependency. What is worth borrowing is
its *posture*: a library ships type-level building blocks as part of its public
API, and consumers compose and extend them rather than re-declaring their own
parallel types.

Applied to aihu, that means the types baked into each module become **open at
declared seams** — a consumer augments a registry interface and the framework's
own inference improves for their code, without forking types or casting.

The mechanism in TypeScript is interface merging via `declare module`. aihu
already uses that shape internally for virtual modules (`packages/app/src/virtual.d.ts`
declares `virtual:aihu-routes` and `virtual:aihu-components`; examples carry
`aihu-modules.d.ts` / `env.d.ts` shims). Today those are **framework-authored
ambient declarations**, not a consumer-facing extension point. The proposal is to
promote the pattern into a supported seam.

## Candidate seams

Ordered by how much real pain they remove. Each needs its own validation before
being scheduled — none is ratified.

### 1. The element registry — closes the "JSX hole"

The strongest case, because the gap is already documented and tested.
`packages/compiler/tests/strict-templates-sidecar-tsc.test.ts:147` asserts
`kebab-case, data-* and aria-* attributes stay open (the JSX hole — spec §2.8)`,
and `:257` asserts `a component tag NO compiled component declares stays open`.

Those holes exist because there is nowhere for a consumer to *say* what their
tags and attributes are. A merged registry gives them one:

```ts
declare module '@aihu/runtime' {
  interface AihuElements {
    'acme-widget': { count: number; label?: string }
  }
}
```

Strict templates could then type `<acme-widget count={s}>` against it instead of
leaving every undeclared tag open. Note the compiler already derives prop types
from `prop()` wrappers for *compiled* components — this seam is specifically for
tags the compiler never sees (hand-written custom elements, third-party
components, design-system tags).

**Open question:** does this compose with, or duplicate, the existing
prop()-derived interface? If it duplicates, the seam should be the *fallback*
for undeclared tags only.

### 2. Plugin option typing

`definePlugin` options are per-plugin and currently cannot be typed from the
call site. A registry keyed by plugin name would let `aihu.config.ts` type-check
plugin options — the same shape Vite/ESLint users expect.

### 3. Context and store key typing

`@aihu/context`'s `contextKey`/`provide`/`inject` and `@aihu/store`'s
`defineStore` both carry types that are known at declaration but not
recoverable at distant use sites. A merged key→type map would make
`inject(SomeKey)` precise across module boundaries.

### 4. Composable type utilities in `@aihu/use`

`@aihu/use` returns getter objects, tuples, and bare getters (the shapes differ
per composable — see the package doc). Exporting the type-level helpers used to
build those returns would let consumers write wrappers without restating them.
This is the closest to literal type-fest posture: ship the utilities, don't hide
them.

## Non-goals

- **Adding `type-fest` as a dependency.** The posture is the borrowed thing, not
  the package. aihu's size gates are per-package contracts; a types-only dep adds
  no bytes, but it also adds no capability we cannot express directly.
- **Making everything augmentable.** Every open interface is a compatibility
  surface that can never be narrowed again. Seams should be few, named, and
  documented.

## Risks

- **Augmentation is permanent API.** A merged interface cannot be tightened
  later without breaking consumers. Each seam needs the same scrutiny as a
  runtime API.
- **It rests on machinery that is currently red.** The strict-templates sidecar
  is the natural host for seam #1, and `strict-templates-sidecar-tsc.test.ts`
  **fails 8 of 12 tests on `main` today** (measured 2026-07-24; pre-existing, not
  caused by any in-flight PR). That should be understood before building on it.
- **The on-disk sidecar is not wired into any CI gate.** Nothing type-checks
  `**/*.aihu.ts` today, so a seam could regress silently. Productionizing
  `aihu check` (Volar `runTsc` over the sidecar) is arguably a prerequisite.

## Next step

Founder ruling on **which seams are in scope**, then a spec for the first one.
Seam #1 is the recommended starting point: the gap is already proven by two
failing-open assertions in the test suite, so success is measurable rather than
aesthetic.
