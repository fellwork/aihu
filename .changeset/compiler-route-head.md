---
"@aihu/compiler": minor
---

Add optional per-route `head:` metadata to the `@route` SFC block and emit it
into the `.route.json` sidecar (B1, foundation of the per-route-`<head>` SEO
arc). The `@route` block gains an optional `head` key carrying `title`,
`description`, `canonical`, nested `og` (`title`/`description`/`image`/`type`/
`url`) and `twitter` (`card`/`title`/`description`/`image`/`site`) objects, and
a raw `jsonld` JSON-LD object. All fields are optional and the existing
`@route` keys (`path`, `name`, `layout`, `ssr`, `middleware`) are unchanged —
a route without a `head` key emits a sidecar with no `head` member, so the
shape is fully backward-compatible.

Both route parsers are updated: the production `sfc.rs::parse_route_body` path
and the parallel `route.rs::parse_route` path share a single head
implementation (a new string/comment-aware balanced-literal capture mode), so
the two cannot drift. `og`/`twitter` are parsed into typed sub-objects;
`jsonld` is captured VERBATIM as the balanced `{...}` literal and spliced into
the sidecar as raw JSON rather than re-serialized. Adds a
`03-route-with-head` conformance fixture and round-trip tests asserting the
emitted sidecar is valid JSON.
