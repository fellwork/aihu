---
"@aihu/css-engine": minor
---

Add the Tailwind-v4 motion utility family to the css-engine token table:

- Transform: `transform` (identity baseline), `transform-none`.
- Translate: `translate-x-N` / `translate-y-N` on the spacing scale, plus the
  negative forms `-translate-x-N` / `-translate-y-N` (a new leading-`-` parse
  path negates the emitted value).
- Rotate: `rotate-N` / `-rotate-N` → `transform: rotate(±Ndeg)`.
- Scale: `scale-N` / `scale-x-N` / `scale-y-N` (percentage → unit factor, e.g.
  `scale-105` → `1.05`).
- Transition: `transition`, `transition-none`, `transition-all`,
  `transition-colors`, `transition-opacity`, `transition-transform`, each with
  the default `150ms` / `cubic-bezier(0.4, 0, 0.2, 1)` timing.
- Duration: `duration-N` → `transition-duration: Nms`.
- Easing: `ease-linear`, `ease-in`, `ease-out`, `ease-in-out`.
- Animation: `animate-none`, `animate-spin`, `animate-ping`, `animate-pulse`,
  `animate-bounce`. Each keyframe-backed animation emits its `@keyframes` block
  as a hoisted top-level sibling rule alongside the class rule (keyframes
  cannot nest inside a selector body; re-emitting an identical block is
  idempotent in CSS).

Each transform utility emits a single `transform:` declaration (no CSS-var
composition), so the engine resolves them via the cascade and `cn()` last-wins
groups (`translate`/`rotate`/`scale`). All compile at build time into
per-component scoped CSS; no runtime cost and no browser-bundle size impact (the
logic lives in the `aihu-css-core` Rust crate, which does not ship to the
client).
