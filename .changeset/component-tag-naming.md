---
"@aihu/compiler": minor
---

Component tag naming: PascalCase→kebab normalization + C450 validation.

Custom-element names require a hyphen, so the compiler now normalizes every
component tag to its valid custom-element form — consistently across reference
emission (`branch('user-card', …)`), the route manifest's `components` array,
and the `customElements.define` name:

- Multi-word PascalCase kebab-cases automatically: `<UserCard>` → `user-card`,
  `<APIClient>` → `api-client`, `<HTMLParser>` → `html-parser`.
- Already-hyphenated tags pass through lowercased: `<Aihu-Button>` → `aihu-button`.
- **Single-word component names are a new hard compile error (C450)** — a
  single word (`<Comment>`, or a file stem like `Comment.aihu` with no
  hyphenated `@meta name`) can never become a valid custom-element name. Fix by
  using a hyphenated tag (e.g. `<x-comment>`) or an explicit hyphenated
  `@meta name`.
- Plain lowercase HTML/SVG tags (`div`, `linearGradient`) are untouched, and a
  plain lowercase hyphen-less define-name (e.g. `timer.aihu`) keeps its
  existing warning.

The JS driver mirrors the same normalization for file stems, so the define-name
agrees between the Rust CLI and the Vite plugin.
