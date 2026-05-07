# Verifier Report — V1 — topic:aihu-template-syntax track:userland-dx round:v1

**Audit target:** `feat/template-syntax-v2-b1` @ HEAD `c4b2ede` (parent `feat/template-syntax-v2`)
**Builder manifest:** `.team/build-manifests/r1-prop-reactivity-001.md` (record id 3560191135)
**Audit role:** read-only, sample-evidenced rerun of all 11 acceptance items
**Date:** 2026-05-06

---

## Per-AC verdict table

| # | Criterion | Sample evidence (path:line / test name) | Verdict |
|---|---|---|---|
| 1 | `cargo check --workspace` passes | `cargo check --all-targets` clean against `packages/compiler/Cargo.toml` (only pre-existing warnings in `tests/sfc_conformance.rs:11`, `:445` — unrelated to R1). | PASS |
| 2 | `cargo test -p aihu-compiler` passes (existing + 6+ new) | `packages/compiler/tests/prop_reactivity.rs` — 13 R1 tests all green; total compiler suite ~310 tests across 14 binaries all green. | PASS |
| 3 | `bun run typecheck` passes | `moon run :typecheck` 27 tasks completed, 26 cached, runtime + arbor + bench rebuilt clean. | PASS |
| 4 | `bun run test` passes | Vitest: 84 files, 823 tests passed, 5 skipped (matches manifest). | PASS |
| 5 | parent `setAttribute('name', 'new')` updates child signal | `packages/runtime/tests/define-component.test.ts:244` `R1-AC5: setAttribute → ctx.props.<name>() updates the signal` — `el.setAttribute('name', 'after')` then `captured!() === 'after'`. PASS on rerun (`bun test packages/runtime/tests/define-component.test.ts` → 23 pass). Code path: `define-component.ts:217-225` `attributeChangedCallback` → `_convert(newValue, def, def.value)` → `ps.set(...)`. | PASS |
| 6 | `attribute: false` excluded from observedAttributes | `define-component.test.ts:264` `R1-AC6: attribute: false omits the prop from observedAttributes` asserts `observed.toContain('title')` AND `observed.not.toContain('user')`. Code path: `define-component.ts:101-107` builds `attrName: null` when `attribute === false`; the loop at `:120-122` skips null attrName. | PASS |
| 7 | `reflect: true` reflects `el.count = 5` to `getAttribute('count') === '5'` | `define-component.test.ts:277` `R1-AC7: reflect: true writes signal value back to attribute on .set` — `el.count = 5` → `el.getAttribute('count') === '5'`. Code path: `define-component.ts:174-189` `ps.set` → `_reflectToAttr` → `setAttribute` inside re-entrancy guard. | PASS |
| 8 | converter Date round-trip ISO | `define-component.test.ts:294` `R1-AC8: converter round-trips an ISO Date attribute`. Compile-side `prop_reactivity.rs:161` `r1_ac8_converter_forwarded` confirms verbatim emission. | PASS |
| 9 | existing `examples/` `.aihu` files still typecheck and build | Compile-only verification: `prop_reactivity.rs:207` `r1_ac9_existing_example_shell_still_compiles` + `:220` `r1_ac9_existing_weather_card_compiles` (include_str! at compile time). Out-of-suite manual check via `aihu-compile` CLI: `Comment.aihu`, `[slug].aihu`, `agent-panel.aihu`, `macro-test.aihu` all compile. **Caveat:** see Open-questions §2 — compile passes but several of these files emit broken JS at runtime (e.g. `comment.by` accessed on the callable signal where it should be `comment().by`). The brief language says "typecheck and build" so the literal AC is met; the spirit-of-AC migration cost is honestly surfaced as Builder open question #2. | PASS (compile-only, per brief language) |
| 10 | reactivity preserved (fine-grained) | Two-source evidence: (a) compiler — `prop_reactivity.rs:97` `r1_ac5_template_binding_reactive` asserts `{label}` lowers to `label()` not `leaf('label')`; signal_map registers prop names as computed at `emit.rs:355,366` (`signal_map.insert_computed(&e.name)`), placing them on the same lowering path that hits `signal_map.is_reactive(name)` at `emit.rs:857,869,2316,2453,2565`. (b) runtime — `define-component.test.ts:322` `R1-AC10: prop signal is fine-grained` asserts unrelated attribute changes do NOT touch the prop's signal. The B1 brief notes: "verify by reading the emit code path" — verified. | PASS |
| 11 | negative: `attribute: false + reflect: true` rejected | Belt + braces: compile-side `prop_reactivity.rs:184` `r1_ac11_attribute_false_plus_reflect_true_rejected` → `C445`; runtime backstop `define-component.test.ts:347` `R1-AC11: ... throws RuntimeError at class build` → `SCR-R0004`. Code: `state_macros.rs:526-555` (parser validator) + `define-component.ts:108-115` (runtime backstop). | PASS |

**Result: 11 / 11 PASS.**

---

## Bidirectional audit

### Under-implementation findings

None load-bearing. Five minor items to note:

1. **AC9 narrow read.** The Builder verifies AC9 only via compile-only tests on 2 of the 13 `$prop`-using example .aihu files. Manual compilation of the others (Comment.aihu, [slug].aihu, agent-panel.aihu, macro-test.aihu, etc.) succeeds but emits runtime-broken JS for property-access patterns like `comment.by`, `route.params.slug`, `mockForecasts[location]`. Under the brief's literal "typecheck and build" wording this passes. The Builder's open question #2 is exactly this gap, surfaced honestly. **Not a fail under the brief but worth Director r6 awareness.**
2. `connectedCallback` initial-read uses the same `_convert` code path as `attributeChangedCallback` (verified `define-component.ts:142-148` vs `:217-225`). Spec-aligned.
3. Property accessor on the class prototype reads through the signal getter and writes through `.set` (`define-component.ts:236-247`). Verified.
4. Type-conversion defaults: string identity (`_convert:285`), number `Number()` + NaN-guard (`:281`), boolean presence (`:277`), object JSON.parse with fallback (`:288-292`). All four paths exist and have dedicated runtime tests.
5. Reflection guard prevents infinite loop via per-instance `Set<string>` at `define-component.ts:97`, entered at `:182-185` and exited in `finally`. attributeChangedCallback skips dispatch when name in guard at `:217-218`. `define-component.test.ts:446` `R1: reflect re-entrancy guard` asserts `setCount === 1`.

### Over-implementation findings

**None.** The Builder's diff scope matches R1 exactly:

- Files modified: `.size-limit.json`, `README.md`, `packages/compiler/src/codegen/emit.rs`, `packages/compiler/src/parser/state_macros.rs`, `packages/runtime/src/{define-component,index,types}.ts`, plus tests + new R1 fixture under `packages/compiler/tests/fixtures/r1-prop-reactivity/`.
- README diff is size-limit metadata only (`@aihu/runtime 2.02 → 2.66 kB`).
- No `.aihu` file outside the new R1 fixture directory was touched.
- No template-syntax (Variant B), $bind, $aria, $controller, $context, $lifecycle, $show, $form, codemod, sidecar emit was touched. Confirmed by `git diff feat/template-syntax-v2..feat/template-syntax-v2-b1 -- packages/compiler/src/{codegen,parser}` containing zero references to those macros (only "template binding sites" appears, in code comments — false positive on string match).
- 12 R1 runtime tests + 13 R1 compiler tests added; manifest claim of 12+13=25 verified exact.

### Open-questions assessment

| # | Question | Verdict |
|---|---|---|
| 1 | Runtime size budget — accept platform-fix cost or lazy-attach props machinery for R5/R6/R7? | Honest substance Q for Director r6. Builder chose path (a) (accept cost, bumped 2100→2750 B with 30 B headroom remaining) and surfaced (b)/(c) as alternatives. |
| 2 | Body-call-syntax migration — codemod B3 territory or stay manual to v0.4? | Honest substance Q. **The Verifier's manual-compile spot-check confirms this is real**: at minimum 4 example .aihu files emit runtime-broken JS post-R1 due to bare property-access on callable signals. Builder did NOT silently break — they noted "examples already runtime-broken pre-R1" via const-reassignment-in-actions. Director r6 must adjudicate whether B3 codemod handles this. |
| 3 | $bind two-way + reflect interaction | Out-of-scope for B1 (R4/B2 territory per Director r5 §5). Honestly punted. |
| 4 | observedAttributes precedence on `attrs ∪ propAttrNames` collision | Honest substance Q for Director r6. Currently legacy `attrs` path takes precedence in `attributeChangedCallback` (`define-component.ts:214` runs first, `:218-225` runs second; both fire). Not currently exercised by any SFC. Edge case worth nailing down before R5/R6 land. |

All 4 open questions are honest-substance questions or out-of-scope. **Zero spec gaps were skipped by the Builder.**

---

## Cross-cutting checks

- **Existing 62 in-repo `.aihu` files compile**: cargo test sweep is green for all conformance tests; spot-check of 4 additional $prop-using files via CLI succeeds (with the runtime-correctness caveat in Open Q #2).
- **Reactivity preserved**: per-attribute `mountEffect` frame reused. `signal_map.insert_computed(&e.name)` at `emit.rs:355,366` puts prop names on the same path as `$computed`; `is_reactive(name)` returns true; binding sites lower to `name()` and pass through the standard signals→arbor `mountEffect` pipeline. No whole-component re-render introduced.
- **Type safety**: `PropDef`, `PropsConfig`, `PropSignal`, `PropsContext` all exported from `packages/runtime/src/types.ts`; `ComponentOptions.props?:` typed; `setup` ctx type intersected with `PropsContext`. Verified (`bun run typecheck` clean). Per-prop typing of attribute-conversion-result is `unknown` — acceptable; sidecar .aihu.ts is B3 territory.
- **Pre-push hooks pass**: `bunx biome ci .` clean (399 files, 114ms, no fixes). `bun run typecheck` clean. `bun run test` 823/828 pass. `bun run size` all 11 packages within limits (runtime at 2.66 / 2.75 kB = 30 B headroom — tight but green).
- **Branch state**: HEAD `c4b2ede` matches manifest claim. Working-tree dirty only on `scripts/__bundle-sizes.json` (unstaged) + four untracked unrelated dirs (`.team/director-notes/v0.2.x-cleanup-director-001.md`, `.team/web-migration/`, two `docs/*compiler-0.1.{1,2}.md`) — not part of B1 scope; no read or write by the Builder claimed.

---

## Final verdict

**STATUS: V1 PASS**

11 / 11 acceptance items confirmed by actual artifact + sample-named test rerun. Zero over-implementation. Four open questions all honest substance (#1, #2, #4) or out-of-scope (#3). The size-budget headroom (30 B) is the tightest constraint going into R5/R6/R7; Director r6 should adjudicate Open Q #1 before B4/B5.

The Builder's manifest is accurate to the diff. Test counts (12 runtime + 13 compiler), file deltas, and acceptance evidence all check out on rerun.

**Approved for merge to `feat/template-syntax-v2`.**

---

## Audit metadata

- Time spent: ~75 min (cargo + bun reruns dominated; full `bun run test` 5.88s; full compiler suite < 5s).
- Sources cited:
  - Builder manifest record 3560191135.
  - Director r5 record 4012772269.
  - Auditor A platform-integration §A2 record 1158474995 (cited in B1 brief).
  - Scout D2 reactivity wiring record 1601711401 (cited in B1 brief).
- No code modified by Verifier. Read-only audit per playbook discipline.
