---
"@aihu/app": patch
"@aihu/server": patch
---

Update `document.head` on client-side SPA navigation to reflect each route's
per-route `<head>` (B5, SEO arc). `createApp()` now lowers the active route's
`head` (merged with optional global `app.head` defaults and resolved against
`site.url`) and applies it to the live `document.head` — setting `<title>`,
upserting `<meta>`/`<link rel=canonical>` by key, and injecting the JSON-LD
`<script>`. Per-page tags are tracked and cleaned up on every navigation so
stale title/canonical/OG/JSON-LD never accumulate; global defaults persist.

The HeadConfig→tag application core is now shared (`head-apply.ts`) between the
SSG prerender (string transform) and the client (live-DOM) paths so they can
never diverge. To keep the browser client bundle `node:`-free, `@aihu/server`
gains a pure `@aihu/server/head-lowering` subpath export for `routeHeadToSsrHead`
(the barrel reaches the native loader and must not enter a browser bundle).
