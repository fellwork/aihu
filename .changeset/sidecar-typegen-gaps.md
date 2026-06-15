---
"@aihu/compiler": patch
---

Close the remaining `.aihu.ts` sidecar `TS2304` gaps after 0.9.3. 0.9.3 put
top-level `@state` consts in scope but three classes of template-referenceable
name were still missing, so regenerated sidecars still failed `tsc`:

- **Signal setters.** `const [view, setView] = signal()` declared the getter
  `view` but not `setView`; a handler like `$on.click={() => setSel(x)}` then
  `TS2304`'d on the setter. Setters (`resolve_signals` values) are now in scope.
- **`$each` / `{#each}` loop aliases.** Loop vars (`sections() as s`,
  `s.books as b`, and crucially `chaptersOf(selBook()) as c` — an iterable with
  a nested call) were never declared. All `item`/`index` aliases from both the
  attribute and block forms are now collected from the template AST. The
  attribute-form `$each` list expression is also collected now (mirroring the
  block form), so an outer alias referenced only inside an inner each's iterable
  (`s` in `s.books as b`) still counts as referenced.
- **`@state` imports used directly in the template.** Names brought in via
  `import { closeNav } from '…'` and read in the template (not re-bound to a
  local const) are now collected from the import statements.

All names are emitted as `any` parameters of `__aihu_template` only when
referenced by a template expression — so no unused parameters and no collision
with DOM globals. Verified end-to-end: the real fellwork-web passage-picker
sidecar (which exercises all three classes, including the nested-call each)
now passes `tsc --noEmit --strict` with zero errors.
