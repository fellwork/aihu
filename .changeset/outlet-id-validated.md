---
'@aihu/app': patch
---

Make a broken `app.outletId` a build error instead of a silent runtime
divergence, and fix two real matching bugs in the outlet splice.

`app.outletId` became real config in `609d0774` but was validated as a bare
`v.string`, while the splice that consumes it (`injectIntoOutletId`, shared by
the live SSR path and the SSG prerender) matched a narrower grammar than that
string could express. Everything in the gap failed silently: the server spliced
one place, the client's `getElementById` looked in another, and the only report
was a single `console.error` — inside a Worker, which is the least-read place a
framework can put anything.

**The splice matched things that are not the id attribute.** `\bid="` puts a
word boundary between the hyphen and the `i`, so `data-id="outlet"` matched —
along with `aria-id`, `x-id`, and any other prefixed attribute — and the page
content was spliced into the wrong element. The rule is now whitespace before
`id=`, which is what actually separates an attribute from the tag name or its
predecessor and which no prefixed attribute can satisfy.

**And it missed things that are.** Only DOUBLE-quoted `id="…"` matched.
`index.html` is authored by the *consumer* — Vite requires one, and this repo's
scaffold is only one of the ways it gets written — and vite passes its quoting
through verbatim (verified: a built `index.html` still reads `id='app-root'`).
So `id='outlet'`, an entirely ordinary document, spliced nothing. Both quotings
are accepted now.

Unquoted `id=outlet` is deliberately **not** accepted. It is legal HTML but
effectively unwritten, and matching it would make any `id=<outletId>` sitting
inside another attribute's *value* a splice target — a false positive the quoted
forms cannot produce, since a double-quoted value cannot contain a double quote.

**Two new gates, so declining it is no longer silent.**

`app.outletId` is validated against the HTML4 `ID` production
(`/^[A-Za-z][A-Za-z0-9_:.-]*$/`). HTML5 relaxed this to "any non-empty string
with no ASCII whitespace"; the older, narrower rule is chosen deliberately as
the set that is safe in every place this one value travels to unescaped — a
quoted attribute in the emitted template, a regex splice target,
`document.getElementById`, and a `#id` CSS selector. Widening later is additive;
narrowing later would break configs. `''`, `'a"b'` and `'my outlet'` all passed
before and are now named config errors.

And `virtual:aihu-ssr-document` — which already reads the finished client
`index.html` and already hard-fails when it is absent — now also fails when the
document contains no outlet the splice can match. Everything needed was already
on hand at that point; checking there turns "green build, every page an empty
shell until the client boots" into a named, pre-deploy failure. The gate is
implemented by *asking the splice* with empty content rather than by a second
regex, so it cannot drift from the thing it gates — pinned by a test that
asserts the two agree across six template shapes.

Verified by real `vite build` runs in the workers-ssr e2e fixture: each
malformed `outletId` shape is rejected before a file is emitted, an unquoted
outlet fails with a message naming the quoting rule, and the existing
non-default-outlet variant now uses single quotes end to end — which is what
demonstrated the double-quote gap was reachable through a real build in the
first place.

One existing test fixture was internally inconsistent in exactly the way the new
gate exists to catch (it configured `outletId: 'app-root'` against the default
`id="outlet"` template) and has been corrected to the consistent pair it always
meant to assert.
