---
'@aihu/cli': patch
---

Fix four correctness bugs in the hand-rolled semver range matcher, one fail-open.

`semver-range.ts` exists so that `@aihu/cli` can enforce a template manifest's
`cliRange` without taking a dependency to compare two version strings. That
trade is only defensible if the implementation is right, and in four places it
was not. All four were measured against the real `semver` package (7.8.5);
the fixtures in `semver-range.test.ts` are those measurements, and the fix was
validated against a 4,140-pair cross-product of operators × partial/wildcard
cores × versions with zero remaining divergence.

**1. Partial `>` and `<=` bounds did not promote.** The module claimed partial
versions "resolve their wildcards to zero", which is true for `>=` and `<` and
wrong for the other two — npm steps them past the whole range the partial
names:

| range   | npm resolves to | this module resolved to |
| ------- | --------------- | ----------------------- |
| `>1.2`  | `>=1.3.0`       | `>1.2.0`                |
| `>1`    | `>=2.0.0`       | `>1.0.0`                |
| `<=1.2` | `<1.3.0-0`      | `<=1.2.0`               |
| `<=1`   | `<2.0.0-0`      | `<=1.0.0`               |

**2. `>1` was fail-open, and so was `>*`.** `satisfiesRange('1.5.0', '>1')`
returned `true` where npm returns `false`. `assertTemplateCompatibility` uses
this to decide whether the running CLI may scaffold a template, so a template
declaring `cliRange: '>1'` — meaning "2.x or newer" — was waved through by every
1.x CLI. `>*` and `<x` were the same shape of bug: npm reads them as "nothing is
allowed" (`<0.0.0-0`), this module read them as "anything is". A gate that fails
open is not a gate.

**3. A wildcard atom inside an AND-set discarded the set.** `>=1.0.0 * <2.0.0`
threw away *both* real comparators and matched anything, so 2.5.0 satisfied a
range capped at 2.0.0. npm drops the wildcard and keeps the rest. Dropping
constraints is the precise opposite of this module's stated fail-closed
contract.

**4. Syntax npm accepts was rejected, which BLOCKED good templates.** `>= 1.0.0`
(space after the operator) and `v1.2.3` / `=v1.2.3` / `^v1.2.0` (the `v` prefix)
both threw inside the tokenizer, and `assertTemplateCompatibility` turns a throw
into "template declares an unusable cliRange" and refuses to scaffold. Failing
closed is right for syntax that cannot be read; it is not right for syntax npm
reads without complaint. Both forms are now tolerated — a bare operator with no
operand (`>=`) still throws.
