---
"@aihu/compiler": patch
---

Fix `html={expr}` prerendering as empty under `output: 'static'`.

`html={expr}` was classified an SSR-transparent element effect, so
`emit_element_base` emitted nothing for it into `__ssrString` and the content
only appeared once the client's `onMount` `replaceChildren` ran. Any page whose
body IS an `html` binding therefore prerendered hollow — correct in a browser,
invisible to crawlers, agents, and readiness graders.

The expression is now interpolated into the SSR string (`raw` still wins and
suppresses it). Measured on `apps/docs-next`: pages carrying under 200 chars of
prerendered text went 8 -> 0, total prerendered text 339k chars, guides went
from 0 bytes of prose to 4.9k-36k each. Verified on the deployed staging origin
after merge: `/guides/getting-started` serves 12,087 bytes of prose to a no-JS
client, up from ~60 bytes of nav chrome.

Note for consumers: under `output: 'static'` the value is interpolated
**unescaped** into served HTML. Treat `html={expr}` as `innerHTML` at build
time — never point it at untrusted or remote content.

Landed in #572; this changeset was missed at merge, so the fix would have
shipped without a changelog entry.
