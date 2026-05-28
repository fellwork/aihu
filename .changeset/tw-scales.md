---
"@aihu/css-engine": minor
---

Add named/numeric scales for position and typography utilities to the
css-engine token table (round 2 of tailwind-support):

- Position scale — `top-N` / `right-N` / `bottom-N` / `left-N` / `inset-N` /
  `inset-x-N` / `inset-y-N` on the Tailwind spacing scale (`top-4` → `top: 1rem;`),
  plus the `auto` keyword (`top-auto`), `inset-0` → `inset: 0;`, the logical
  `inset-inline` / `inset-block` shorthands, and negative offsets via a leading
  `-` (`-left-2` → `left: -0.5rem;`).
- Line-height scale — `leading-{none,tight,snug,normal,relaxed,loose}` (unitless
  multipliers) and numeric `leading-<n>` mapping to the spacing scale.
- Letter-spacing scale — `tracking-{tighter,tight,normal,wide,wider,widest}`
  in `em` units.

Each family registers a `conflict_groups()` entry so `cn()` resolves last-wins
per property. The existing arbitrary-value forms (`top-[1rem]`, `leading-[1.4]`)
are untouched. All compile at build time into per-component scoped CSS; the new
logic lives in the `aihu-css-core` Rust crate, which does not ship to the
client, so there is no browser-bundle size impact.
