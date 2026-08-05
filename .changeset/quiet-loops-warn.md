---
'@aihu/compiler': patch
---

Stop warning that an `each` loop's binder is undeclared.

`warn_undeclared_template_refs` flags `@template` identifiers not declared in
`@state`. `collect_each_aliases` fed it the loop binders to exempt — but only
from `$each=` and `{#each list as item}`, both RETIRED v1 spellings. It never
learned `each={item of list}`, the only form grammar v2 accepts (C606).

So every correct `each` loop warned that its binder was undeclared, in a scope
where the binder CANNOT be declared: `each={c of constructs}` binds `c` in
template scope. 618 such warnings in apps/docs alone — `c`, `p`, `a`, `rel`,
`ex` — all false.

This mattered beyond noise. The warning's own doc comment says "a false
positive here will reject a valid app once it becomes a hard error", and its
text promises exactly that: "Undeclared cross-block references will become
errors in v0.4." As written it would have rejected every valid `each` in the
ecosystem at the v0.4 boundary.

The binder scan now handles the v2 form, requiring a preceding whitespace so
`$each={` and other suffix matches are not mistaken for the naked attribute,
and splitting on the LAST ` of ` so a list expression containing ` of ` cannot
truncate the binder list. Three tests pin it: single binder, `item, i` pair,
and a genuinely undeclared name that must STILL warn.
