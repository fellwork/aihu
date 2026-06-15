---
"@aihu/compiler": patch
---

Close the last two `.aihu.ts` sidecar gaps after 0.9.4 (26 → 0 across the
consuming projects):

- **Imported / single-element-destructure symbols used in templates (TS2304).**
  Names brought in via a **multi-line** `import { … }` block were missed by the
  previous line-at-a-time scan, so imported handlers (`closeNav`, `toggleTheme`,
  …) referenced directly in the template still `TS2304`'d. Import statements are
  now reassembled across lines before parsing. Single-element destructures
  (`const [showLine] = signal(false)` — `resolve_signals` only seeds two-element
  getter/setter pairs) are now collected too, along with general
  array/object destructure bindings.

- **Inline event-handler params are untyped (TS7006).** `$on.click={(e) => …}`
  emitted `void ((e) => …)` in the sidecar — `e` had no contextual type, so
  `noImplicitAny` flagged it. Handler expressions are now emitted in call
  position to a typed helper (`declare function __handler(h: (...args: any[]) =>
  any): void;` → `__handler((e) => …)`), which gives inline arrow params a
  contextual `any` type. Plain value expressions still use `void (…)`. A
  non-function handler still type-errors, as intended.

Verified end-to-end: the real fellwork-web `passage-picker.aihu` plus a repro
exercising all three classes (multi-line import, single-element destructure,
handler param) pass `tsc --noEmit --strict --noUnusedLocals --noUnusedParameters`
with zero errors.
