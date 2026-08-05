---
'@aihu/compiler': patch
---

Compile a zero-attribute, zero-child component reference to a child render
call instead of an empty element.

A reference to another component compiled to an empty custom element: the
child's template lives in a module this compilation never sees, so there was
nothing to inline. That is why every prerendered page shipped an empty
`<site-header>`.

The reference now lowers to `__aihu_schild(tag, hostAttrs, __opts)` — the
`@aihu/runtime/ssr` helper that renders the child through the registry the
caller pre-resolved onto `__opts`. With no registry the helper emits the same
empty element, so output is byte-identical for any site that has not wired one
up.

The emitted opts type is now a single `__AihuSsrOpts` alias rather than the
same inline shape spelled in four positions, since `children` has to reach all
of them.
