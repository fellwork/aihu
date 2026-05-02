# Scribe Spec Amendments — 2026-05-02

Three amendments to the scribe spec quartet, addressing inconsistencies and gaps identified in the cross-spec consistency audit.

---

## Files in this set

| File | Target spec | Type |
|---|---|---|
| `AMENDMENT-01-macro-vocabulary-route-clarification.md` | Macro Vocabulary Spec §1 | Addition (note) |
| `AMENDMENT-02-block-structure-split-bundle.md` | Block Structure Spec §11 | New subsection (§11.5) |
| `AMENDMENT-03-plugin-contract-server-contributions.md` | Plugin Contract Spec | New section (§6.5) |

---

## Apply order

Amendments must be applied in this order due to cross-references:

1. **Amendment 01** (Macro Vocabulary) — independent, can be applied first
2. **Amendment 02** (Block Structure) — independent, must be applied before Amendment 03
3. **Amendment 03** (Plugin Contract) — depends on Amendment 02

---

## Decision points (require user input before applying)

### Amendment 02
- **Path convention:** Choose Option A (`_scribe-server/` prefix, recommended) or Option B (`/server/_actions/` prefix). See §"Decision point" in the amendment file.

### Amendment 03
- **Provisional status:** Choose Option A (mark §6.5.3 middleware as provisional, recommended) or Option B (commit as stable v1 surface). See §"Decision point" in the amendment file.

---

## What the amendments fix

### Amendment 01 — `@route` block clarification

The Macro Vocabulary Spec references "4 blocks" throughout, but the Block Structure Spec §7.3 introduces a fifth block (`@route`) valid only in pages. Amendment 01 adds a single explanatory note resolving the apparent inconsistency. The note clarifies that `@route` is a structural data block with no macros, so it's outside the macro vocabulary's scope.

### Amendment 02 — Split-bundle compilation

Three macros (`$server`, `$action` on forms, `@agent` block) cause the compiler to emit multiple output artifacts from a single SFC. The Macro Vocabulary Spec describes the function-level behavior of each, but no spec previously documented this as a structural rule. Amendment 02 adds §11.5 to the Block Structure Spec with:

- A unified table of which macros cause split compilation
- Coordination guarantees (path determinism, runtime invariants)
- Implementation requirements for build-target awareness
- A formal definition of the three build targets (client / server / universal)

### Amendment 03 — Server-side plugin contributions

The Plugin Contract Spec didn't previously address server-side contributions, even though real plugins (auth, data, forms) need them. Amendment 03 adds §6.5 covering:

- Server-only runtime helpers (§6.5.1)
- Server-emitting plugin macros via `serverOnly: true` (§6.5.2)
- Server middleware contributions (§6.5.3, marked provisional)
- Build coordination rules (§6.5.4)
- Configuration access (§6.5.5)
- Error cases (§6.5.6)
- Build target awareness for plugins (§6.5.7)

---

## Spec version impact

All three amendments bump the affected spec from `0.1.0-draft` to `0.1.1-draft`. None of them are breaking changes against the v0.1.0 drafts because the drafts haven't been finalized yet.

If applying after the specs are finalized to v1.0, these would be minor version bumps (1.0 → 1.1) since they only add to existing surfaces.

---

## After applying

Once all three amendments are applied:

- The spec quartet (Block Structure, Template Attribute Syntax, Macro Vocabulary, Plugin Contract) will be internally consistent
- Compiler implementers will have a unified picture of split-bundle compilation
- Plugin authors will have formal guidance for server-side contributions
- The `@route` reference in the Macro Vocabulary Spec will no longer appear inconsistent

---

## What's NOT in these amendments

A few items from the audit are intentionally deferred:

- **`componentAliases` config option** referenced in Plugin Contract §6.2 but not formally defined. Will be addressed in the Project Config Spec (not yet drafted).
- **Cross-spec terminology alignment** ("route handler" vs "page" vs "route component"). Worth a glossary pass on a future spec revision.
- **Visual review of the Macro Vocabulary §1 footnote cluster.** Amendment 01's new note may visually conflict with the existing counting footnote; needs a quick visual check after applying.

These are minor and don't block the amendment set.
