# B4 $aria Build Manifest

**Branch:** feat/template-syntax-v2-b4  
**Date:** 2026-05-07  
**Builder:** Claude Sonnet 4.6  
**Spec:** §3.2 (R5)

---

## STATUS: DONE

All 10 B4 acceptance-criterion tests pass. Parser + codegen fully
implemented. No regressions across the full compiler test suite (232 Rust
tests). Size budget: `$aria` is compiler-only codegen — zero runtime bytes
added; `@aihu/runtime` unchanged.

---

## Files Changed

### New Files
- `packages/compiler/tests/b4_aria.rs` — 10 tests covering all ACs + 2 additional

### Modified Files
- `packages/compiler/src/types.rs` — `Aria` variant added to `CollectionKind`
- `packages/compiler/src/parser/state_macros.rs` — `$aria` keyword wired into
  collection parser; `Event`/`Aria` arms added to exhaustive `c440()` match;
  pre-existing `..Default::default()` fix in `check_prop_attribute_collisions()`
- `packages/compiler/src/codegen/emit.rs` — `emit_aria_wiring()`, `aria_idl_prop()`,
  `is_thunk()`, tabindex injection, keyboard-promotion codegen; `effect()` import
  gating for reactive aria entries

---

## AC Pass/Fail Table

| AC | Description | Status | Notes |
|----|-------------|--------|-------|
| AC1 | `$aria: { role: 'button', label: 'Close' }` — static role + label + attachInternals | DONE | `b4_aria_basic_role_emit` |
| AC2 | Reactive thunk label wrapped in `effect()` | DONE | `b4_aria_reactive_label` |
| AC3 | Auto-keyboard-promotion: keydown on `<div>` with role=button + $on.click | DONE | `b4_aria_keyboard_promotion` |
| AC4 | No keyboard promotion on native `<button>` root | DONE | `b4_aria_no_keyboard_on_button_tag` |
| AC5 | Default tabindex="0" injected for focusable role on non-native root | DONE | `b4_aria_default_tabindex` |
| AC6 | No tabindex="0" injected when author already declares tabindex | DONE | `b4_aria_no_tabindex_if_declared` |
| AC7 | Empty `$aria: {}` compiles (warning, no codegen) | DONE | `b4_aria_empty_collection_warns` |
| AC8 | No `attachInternals` overhead for SFCs without `$aria` | DONE | `b4_aria_no_overhead_without_collection` |
| AC+ | Reactive `pressed` uses `String()` cast + `effect()` | DONE | `b4_aria_reactive_pressed_string_cast` |
| AC+ | Multiple $aria keys (role+pressed+label) all wired correctly | DONE | `b4_aria_multiple_keys` |

---

## Test Results

```
cargo test -p aihu-compiler b4_aria
  running 10 tests ... all ok (0 failed)

cargo test -p aihu-compiler
  running 232 tests ... all ok (0 failed)
```

---

## Size Verification

`$aria` is compiler-only. No new runtime code was added. The emitted JS
uses `this.attachInternals()` (a platform built-in) and `effect()` from
`@aihu/signals` (already imported for other reactive features). Neither
adds new bytes to any `@aihu/*` package.

Size check (`bun run size`) requires `packages/context/dist/index.js` which
cannot be built in this worktree due to a pre-existing `rolldown` toolchain
issue (rolldown not installed in worktree node_modules). This failure is
present on `main` as well and is unrelated to B4.

**Manual verification of unaffected packages:** Not applicable — no runtime
source files were modified.

---

## Implementation Notes

### $aria Key → IDL Property Mapping (`aria_idl_prop()`)

| $aria key   | ElementInternals IDL property |
|-------------|-------------------------------|
| label       | ariaLabel                     |
| role        | role                          |
| pressed     | ariaPressed                   |
| checked     | ariaChecked                   |
| expanded    | ariaExpanded                  |
| selected    | ariaSelected                  |
| disabled    | ariaDisabled                  |
| hidden      | ariaHidden                    |
| valuetext   | ariaValueText                 |
| valuenow    | ariaValueNow                  |
| valuemin    | ariaValueMin                  |
| valuemax    | ariaValueMax                  |
| live        | ariaLive                      |
| atomic      | ariaAtomic                    |
| relevant    | ariaRelevant                  |
| busy        | ariaBusy                      |
| haspopup    | ariaHasPopup                  |
| level       | ariaLevel                     |
| multiline   | ariaMultiLine                 |
| multiselectable | ariaMultiSelectable       |
| orientation | ariaOrientation               |
| readonly    | ariaReadOnly                  |
| required    | ariaRequired                  |
| sort        | ariaSort                      |
| colcount    | ariaColCount                  |
| colindex    | ariaColIndex                  |
| colspan     | ariaColSpan                   |
| rowcount    | ariaRowCount                  |
| rowindex    | ariaRowIndex                  |
| rowspan     | ariaRowSpan                   |
| setsize     | ariaSetSize                   |
| posinset    | ariaPosInSet                  |
| description | ariaDescription               |
| keyshortcuts | ariaKeyShortcuts             |
| roledescription | ariaRoleDescription       |
| flowto      | ariaFlowTo                    |
| owns        | ariaOwns                      |
| controls    | ariaControls                  |
| labelledby  | ariaLabelledBy                |
| describedby | ariaDescribedBy               |
| details     | ariaDetails                   |
| errormessage | ariaErrorMessage             |
| activedescendant | ariaActiveDescendant    |
| (default)   | aria{PascalCase(key)}         |

### Keyboard Promotion Logic

Fires when ALL of:
1. `$aria.role` is one of: `button`, `link`, `menuitem`, `tab`
2. Template root has `$on.click` directive (normalized to `on:click` in parser)
3. Template root tag is NOT in: `a`, `button`, `input`, `select`, `textarea`, `summary`, `details`, `area`

Emitted code:
```js
this.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    this.click();
  }
});
```

### Tabindex Injection

For focusable roles (`button`, `link`, `menuitem`, `tab`, `checkbox`, `radio`,
`switch`, `combobox`, `listbox`, `option`, `treeitem`, `gridcell`, `row`,
`rowheader`, `columnheader`, `slider`, `spinbutton`, `searchbox`, `textbox`):

- If root element has no existing `tabindex` attribute → inject `tabindex="0"`
- Injection occurs by mutating the cloned template AST before `emit_nodes()` runs
- Author-declared `tabindex` (any value, including `-1`) suppresses injection

### Boolean ARIA Properties

`pressed`, `checked`, `expanded`, `selected`, `disabled`, `hidden` are cast
with `String()` when reactive (thunk form), per ElementInternals IDL spec.

---

## Pre-existing Issues Fixed (Side-effect)

Two pre-existing Rust compile errors in `state_macros.rs` were fixed:
1. `E0063`: `CompileError` struct literal missing `from`/`to` fields in
   `check_prop_attribute_collisions()` — fixed with `..Default::default()`
2. `E0004`: Non-exhaustive `CollectionKind` match in `c440()` — fixed by
   adding `Event` and `Aria` arms
