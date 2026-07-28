# HYPHENLESS CUSTOM-ELEMENT TAGS SHIP GREEN — the gate is a warning, on the wrong path

**Topic:** compiler (tag emit / custom-element naming)
**Session:** named 2026-07-27 (retro C-FEL-RETRO-0727, incident 5)
**Category:** compiler, measurement-integrity
**Severity:** high — a **latent, SHIPPED** bug: components that can never register in a
browser are emitted, and the build is green. **Still open.**

## The trigger

The compiler emits custom-element tags with **no hyphen** — `timer`, `link`,
`outlet` among them. The HTML custom-element spec **requires** a hyphen in a valid
custom-element name, so `customElements.define('timer', …)` throws and the element
**never registers**: it renders as an unknown inert element. The compiler emits a
warning about this — reported at ~32 warnings per CI run — and **the build stays
green**. The warnings scroll past; nothing fails.

## The mechanism, at code level

The compiler *knows* the rule and even has a hard error for it — **on one path**:

- The check: `packages/compiler/src/lib.rs:431` — `… && !name.contains('-')`.
- The message: `packages/compiler/src/lib.rs:822` — *"custom-element names require a
  hyphen; the single word '{tag}' can never satisfy that"* — with a hint at `:825`
  (*"use a hyphenated tag (e.g. '<x-…>') or set an explicit hyphenated `@meta name`"*).
- **A component *reference* to a non-hyphenated tag is a HARD ERROR**:
  `packages/compiler/src/tags.rs:130` emits `C450: component tag '…' resolves to '…',
  which is not a valid custom-element name — custom elements require a hyphen`.
- **But the emit/define path only WARNS.** `packages/compiler/src/bin/main.rs:160-161`:
  *"a single-word define-name (`Comment`, `timer`) that can't carry a hyphen keeps
  the historical emit-time hyphen **WARNING** rather than erroring — only component
  references are a hard error."* Reaffirmed at `bin/main.rs:497` and
  `packages/compiler/src/wasm.rs:67`.

So the codebase has **both** a hard error (C450) and a soft warning for the *same
platform rule*, and the artifact that actually ships — the single-word element
**definition** — goes down the warning path. This is the exact shape of
`checked-thing-is-not-the-changed-thing.md`: the gate (C450) exists, but not on the
path that changed the output.

## The promotion rung: below prose — an un-gated diagnostic

A warning that does not fail a build is **weaker than prose in a lessons file**: at
least a lessons file is read on purpose. A warning printed 32 times among a green
CI log is trained-to-ignore from birth — the same `bench`-red dynamic named in
`checked-thing-is-not-the-changed-thing.md` ("The inverse failure"), one rung lower,
because it is not even red.

> **A diagnostic that cannot fail the build is not a gate; it is a suggestion the
> build is designed to survive.** "The compiler warns about it" is *not* a fix — it
> is the absence of one, restated as diligence.

**No fix has landed.** The promotion this needs, in order of strength:

1. **Structural (compiler):** make the single-word *define* path emit **C450**, the
   same hard error the *reference* path already emits. The rule is identical; only
   the site differs. This is the real fix.
2. **Structural (CI), as a stopgap:** a job that greps the compiler output for the
   hyphen warning and **fails** on any occurrence. Turns 32 ignored lines into one
   red gate.
3. Anything less (a doc note, a louder warning) stays on the rung that shipped this.

## Recipe

- **When a rule has a hard-error path and a warning path, the warning path is where
  it ships from.** Find every site that applies the rule and make them agree on
  severity — a platform invariant (a name that can never register) is an error
  everywhere or it is an error nowhere.
- **Count your warnings.** A stable count of N warnings every run (here ~32) is a
  standing defect the build has agreed to tolerate. Grep-gate it or fix it; do not
  let it become scenery.

## Related

- `promotion-rungs.md` — incident 5 in the retro audit table; the still-open counter-example
- `checked-thing-is-not-the-changed-thing.md` — the gate exists but not on the shipping path; "red by construction" trains ignoring
- `absent-value-rendered-as-real.md` — a skip/warning that reads as an absence of failure
