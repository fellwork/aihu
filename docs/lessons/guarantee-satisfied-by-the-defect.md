# A GUARANTEE SATISFIED BY THE DEFECT IT SHOULD HAVE CAUGHT

**Topic:** cross-cutting (coverage contracts, security-relevant primitives)
**Session:** 2026-07-26, found while ruling on FEL-426 / #619
**Category:** coverage-integrity, security
**Severity:** high — the guarantee is *true*, and it is what makes the defect
invisible
**Status:** named; one instance, one generalisation, no mechanical detection

## The shape

> A coverage contract asserts that a feature is live-exercised. **The assertion
> is true.** The single thing making it true is the one usage in the repo that is
> a defect.
>
> **The guarantee and the defect are the same lines of code.**

Nobody auditing the contract goes looking. The row reads `html: covered ✓`, which
is exactly what you want to see, and it is *correct*. The coverage system counted
**presence** of a usage. It never had an opinion about **safety** of one.

Keep this distinct from the green-by-construction family (FEL-428):

| | what the gate measures | what it reports |
|---|---|---|
| **FEL-428**, green-by-construction | **nothing** | green |
| **this** | **exactly what it claims** | green — and the thing measured *is* the defect |

FEL-428 gates are broken instruments. This instrument works perfectly. That is
why it is worse: there is no malfunction to find, and the reassurance is earned.

## The instance — verified on `origin/main`, not taken on report

`scripts/check-coverage-manifest.ts` enforces a `MUST_BE_LIVE` floor: rows the
governed example set must collectively exercise live. `'html'` is one of them.

```
$ git show origin/main:scripts/check-coverage-manifest.ts \
    | sed -n '/^const MUST_BE_LIVE/,/^]/p' | grep -n "'html'"
23:  'html',

$ # every governed coverage.manifest.json on origin/main declaring "html"
  DECLARES html -> examples/hacker-news/coverage.manifest.json      ← exactly one

$ git grep -c "html={" origin/main -- examples/hacker-news/
origin/main:examples/hacker-news/src/components/hn-comment.aihu:1
origin/main:examples/hacker-news/src/pages/item/[id].aihu:1
origin/main:examples/hacker-news/src/pages/user/[id].aihu:1
```

Those three bindings are **FEL-426** — remote, attacker-controlled HN HTML
interpolated unescaped into served bytes. They are the *only* thing in the
governed set satisfying the `html` floor.

So the repo simultaneously guaranteed *"the `html` primitive is covered"* and
shipped *"the only coverage is a live stored-XSS."* Both statements were true at
the same time, and the first is why nobody looked at the second.

The consequence surfaced only when the fix was attempted: removing the vulnerable
bindings made `check:coverage-manifest` go **red** — `MUST_BE_LIVE row 'html' has
NO live exerciser`. **The coverage gate correctly refused to let the security fix
land**, because the fix deleted the coverage. That is the guarantee and the defect
being the same object, stated by CI.

## The trap this sets, and the ruling that avoids it

When the gate blocks the fix, the tempting move is to **lower the floor** — drop
`html` from `MUST_BE_LIVE` and merge. That is backwards twice over:

1. It answers a live XSS by **reducing** coverage of the primitive involved.
2. **A floor that gets edited whenever it fails is not a floor.**

The ruling taken instead, and the one to repeat:

- **Keep the row.** Do not lower a contract to unblock a fix.
- **Move the exerciser to authored, in-repo content.** `html={}` is
  *intentionally* unsafe by design (`emit.rs:12` says so). The defect was never
  the primitive — only what it pointed at. Trusted authored markup is its correct
  use, and that is what should hold the floor.
- **Add the exerciser in the same PR**, so the floor never goes red between PRs.
  If the work is too big, split it as *"add the exerciser first"* — **never**
  *"lower the floor first."*

Net result is strictly better than before the bug was found: the repo ends up
teaching the *safe* use of the primitive instead of demonstrating the unsafe one.

## The generalisation

> For an **unsafe-by-design** primitive, *"covered"* must mean **"covered by a
> correct usage"** — not "a usage exists."

Every `MUST_BE_LIVE` row inherits this question, and the rows worth auditing first
are the ones whose primitive is dangerous on purpose: raw-HTML injection, `eval`
-shaped escapes, unescaped interpolation, anything whose docstring says
*intentionally unsafe*.

Concretely, when adding a row to a coverage floor:

- Ask **which single artifact satisfies it**, and read that artifact. If the floor
  has exactly one satisfier, the floor is an alias for that file.
- Prefer floors satisfied by **authored, trusted, in-repo** content over floors
  satisfied by whatever example happens to use the feature.
- A floor with **one** satisfier is a single point of failure for the guarantee as
  well as the coverage — the ruling above exists because `html` had exactly one.

## Related

- `absent-value-rendered-as-real.md` — where the value is fictitious; here it is real
- `checked-thing-is-not-the-changed-thing.md` — where the subject is wrong; here
  the subject is right and it is the defect
- `derive-from-disk-cannot-detect-removal.md` — the other coverage-integrity shape
  found the same day, in the same gate
- FEL-426 (the XSS), FEL-428 (green-by-construction), #619
