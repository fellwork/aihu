---
'@aihu/server': minor
'@aihu/app': minor
'@aihu/runtime': patch
---

Prerender referenced components instead of empty shells.

`buildChildRegistry` indexes discovered components by the tag they register
under and rejects a cyclic component graph at build time — loudly, because
render-time recursion is already bounded by a depth cap, so a cycle would
otherwise emit 32 nested copies of the same subtree and write them to disk.

The SSG prerender discovers components under `dir.components`, keying each by
its own `__aihu_tag__` export rather than deriving a tag from the filename, and
passes the registry to every layout and page render.

Also fixes a double `data-a` stamp: a compiled `__ssrString` resolves
`opts.lightScopeId ?? __AIHU_LIGHT_SCOPE_ID__`, so omitting the option let the
module's own id stamp the template root while the host carried it too. Two
stamps make the template root a nested scope root and cut the component's own
`@scope(…) to ([data-a])` rules off at its first child. The child now renders
with an explicit empty scope id, which survives `??` and suppresses the stamp.
