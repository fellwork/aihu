# @aihu/css-engine

## 0.4.6

### Patch Changes

- Updated dependencies [[`c3381b9`](https://github.com/fellwork/aihu/commit/c3381b92c3d356d6f78f9db0e8130a9e7a466269), [`30ed2b5`](https://github.com/fellwork/aihu/commit/30ed2b51c215512f840b113afaa1636378e31407), [`2660a52`](https://github.com/fellwork/aihu/commit/2660a52223193eb724450e4b6e9dce32e15ae83b), [`9dd7654`](https://github.com/fellwork/aihu/commit/9dd7654678da1149705e21324f6b30e9baafcd4b), [`a195b80`](https://github.com/fellwork/aihu/commit/a195b8093e639c96b8471ea3567267ca8c11c269), [`dd8cfd6`](https://github.com/fellwork/aihu/commit/dd8cfd639f42ddb05468fe07b6d4f4420a80a8bf), [`80531dc`](https://github.com/fellwork/aihu/commit/80531dcc4dfc43bc9cd399bbb8ab4520efb8f15a), [`0db5827`](https://github.com/fellwork/aihu/commit/0db58275ecabf2d3e49431c810885e1ebfb5a9b6), [`bc0f289`](https://github.com/fellwork/aihu/commit/bc0f289ee38871cda8002e56fba3e3b8b7e34d84)]:
  - @aihu/compiler@1.0.0

## 0.4.5

### Patch Changes

- Updated dependencies [[`df40c34`](https://github.com/fellwork/aihu/commit/df40c34526e985ce656a6a5650ac1d83ebef3a80), [`b279f74`](https://github.com/fellwork/aihu/commit/b279f74b34cd4e901be1cfa5d70c212cf604dfc1), [`212e3e3`](https://github.com/fellwork/aihu/commit/212e3e38ae57de7e38c3211ef0223729ba1511e1), [`212e3e3`](https://github.com/fellwork/aihu/commit/212e3e38ae57de7e38c3211ef0223729ba1511e1), [`38652d5`](https://github.com/fellwork/aihu/commit/38652d544fd1001e42d505627de88976d69c1710)]:
  - @aihu/compiler@0.11.0

## 0.4.4

### Patch Changes

- Updated dependencies [[`8127925`](https://github.com/fellwork/aihu/commit/8127925482725c8394c03298a27b91cbbfc59418), [`8127925`](https://github.com/fellwork/aihu/commit/8127925482725c8394c03298a27b91cbbfc59418), [`8127925`](https://github.com/fellwork/aihu/commit/8127925482725c8394c03298a27b91cbbfc59418), [`250dbbf`](https://github.com/fellwork/aihu/commit/250dbbf4024f77ddfe41cf9d04b14ad5266ccfee), [`8127925`](https://github.com/fellwork/aihu/commit/8127925482725c8394c03298a27b91cbbfc59418)]:
  - @aihu/compiler@0.10.0

## 0.4.3

### Patch Changes

- [#331](https://github.com/fellwork/aihu/pull/331) [`cc24673`](https://github.com/fellwork/aihu/commit/cc246732d7dce820ee6abdc1dc86d391a228d7cf) Thanks [@srmcguirt](https://github.com/srmcguirt)! - `cn()`: register the Tailwind-v4 parity utility families in the conflict map so
  `cn()` de-dupes them last-wins — `size`, `aspect`, `order`, `blur`,
  `backdrop-blur`, `cursor`, `list`, `self`, `shrink`, `grow`, `object`, and the
  gradient stops `from`/`via`/`to`. Families that share a first-dash prefix with an
  existing entry (`font-serif`→`font`, `outline-offset`→`outline`,
  `text-pretty`→`text`, `bg-linear-to`→`bg`) were already covered. Follow-up to the
  utility-parity work in [#329](https://github.com/fellwork/aihu/issues/329).
- Updated dependencies [[`dbc0903`](https://github.com/fellwork/aihu/commit/dbc09031f22ee93d9e5c9a46fea2ca2409463e90)]:
  - @aihu/compiler@0.9.0

## 0.4.2

### Patch Changes

- Updated dependencies [[`fc5fa49`](https://github.com/fellwork/aihu/commit/fc5fa49688ee8aca8ad5de0a513dca1e648a00f3), [`fb436ac`](https://github.com/fellwork/aihu/commit/fb436ac2a1ecb6f9d570ccc05beeeab666c3ad6d)]:
  - @aihu/compiler@0.8.0

## 0.4.1

### Patch Changes

- Updated dependencies [[`eaadd45`](https://github.com/fellwork/aihu/commit/eaadd459118055e422e4ae025ceaa72be39ee17c)]:
  - @aihu/compiler@0.7.0

## 0.4.0

### Minor Changes

- [#329](https://github.com/fellwork/aihu/pull/329) [`8f56e88`](https://github.com/fellwork/aihu/commit/8f56e881e500df7c237f996c319f04dedab3cd7e) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Tailwind-v4 utility parity — render full Tailwind-authored pages on the engine.

  Expands the `aihu-css-core` utility table and fixes two correctness bugs so a
  marketing page authored against full Tailwind v4 compiles entirely on the engine
  (under shadow DOM), instead of silently dropping ~230 unsupported utilities.

  - **New families**: `size-*`, `aspect-*`, gradients (`bg-linear/gradient-to-*`,
    `from/via/to`), `mask-*`, `blur`/`backdrop-blur`, `isolate`, `transform-gpu`,
    outline width/offset, `shadow-xs/xl/2xl/inner`, `rounded-3xl/4xl`,
    `font-serif`, `text-6xl…9xl` + `text-<size>/<lh>` slash line-height,
    `text-wrap/pretty/balance`, `cursor-*`, `list-*`, `sr-only`, `self-*`,
    `shrink/grow`, `order-*`, negative margins, fractional positions, `-z-*`.
  - **Arbitrary color typing**: `border-[…]`/`outline-[…]`/`ring-[…]` are now
    color-vs-width typed by value (`border-[var(--c)]` → `border-color`, not the
    previous invalid `border-width`); `[color:]`/`[length:]` hints honored.
  - **`(--var)` shorthand**: `prefix-(--token)` resolves through the prefix's
    property type (`border-(--c)` is a color), with `/opacity` via color-mix.
  - **Palette**: the scoped emitter registers the Tailwind-v4 oklch value for each
    `--color-<family>-<shade>` a component references (used tokens only), so
    `bg-amber-500` etc. resolve at `:host`.
  - **Variants**: `open`, `first/last/only/odd/even/empty`, pseudo-elements
    `marker/placeholder/before/after/selection/file`, and `group-open`/`peer-open`.

  No JS API or CLI change — utility table + scoped emission only. The native
  `aihu-css-compile` binary is rebuilt from these sources by the existing
  `publish-css-native` release job.

### Patch Changes

- [#293](https://github.com/fellwork/aihu/pull/293) [`7e1f1fe`](https://github.com/fellwork/aihu/commit/7e1f1fe0ef1be17b5ea928727252d849f48c46ef) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Refresh native platform binaries to 0.1.3. The published `@aihu/css-engine-*`
  platform packages were frozen at 0.1.2 and predated the utility PRs [#268](https://github.com/fellwork/aihu/issues/268)–[#275](https://github.com/fellwork/aihu/issues/275)
  (space/grid/border-width families, divide-x/y, position+leading/tracking scales,
  ring widths, motion utilities, group:/peer: + aria-/data- variants, container
  queries) — consumers resolving the 0.1.2 binary compiled against a stale utility
  table. Bumped all four platform packages (`darwin-arm64`, `darwin-x64`,
  `linux-x64-gnu`, `win32-x64-msvc`) to 0.1.3 and updated the `optionalDependencies`
  pins so the next `v*` release rebuilds and republishes the binaries at current
  `main` (the `publish-css-native` job is idempotent and would otherwise skip
  0.1.2). No API or CLI change — binary content only.
- Updated dependencies [[`b85f400`](https://github.com/fellwork/aihu/commit/b85f4008c489a0dba9e36cbdfc48b635eeea375f), [`a54ca1b`](https://github.com/fellwork/aihu/commit/a54ca1b8874583a0301e84c91f2d25713908e41f), [`7ec7155`](https://github.com/fellwork/aihu/commit/7ec71553722eaa4e3f6814e79ec747db68b72451), [`1132357`](https://github.com/fellwork/aihu/commit/113235708bac1e8f9263d35feb865af8f8127f86)]:
  - @aihu/compiler@0.6.0

## 0.3.0

### Minor Changes

- [#268](https://github.com/fellwork/aihu/pull/268) [`1a3a857`](https://github.com/fellwork/aihu/commit/1a3a85792ef0f21611184ff6ea84a5a2a63d09af) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Add five Tailwind-v4 utility families to the css-engine token table:

  - `space-x-*` / `space-y-*` — emit the standard sibling-margin recipe
    (`& > * + * { margin-inline-start | margin-block-start: <scale>; }`).
  - `mx-auto` / `my-auto` (and `mt/mr/mb/ml-auto`) — `spacing_value` now
    accepts `auto`.
  - `max-w-*` named scale — `max-w-xs`…`max-w-7xl`, `max-w-prose`,
    `max-w-screen-*`, and the `none/full/min/max/fit` keywords.
  - Grid templating — `grid-cols-N` / `grid-rows-N` → `repeat(N, minmax(0, 1fr))`,
    `col-span-N` / `row-span-N` → `span N / span N`, plus the `none`/`full`/`auto`
    keyword forms.
  - Border widths — `border-{0,2,4,8}` and directional
    `border-x/y/t/r/b/l-{0,2,4,8}`.

  All compile at build time into per-component scoped CSS; no runtime cost and no
  change to browser-bundle size budgets (the new logic lives in the `aihu-css-core`
  Rust crate, which does not ship to the client).

- [#275](https://github.com/fellwork/aihu/pull/275) [`38a6dc5`](https://github.com/fellwork/aihu/commit/38a6dc5f9531d82b57081562d81a6b6c6d4cae21) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Add aria-_/data-_ attribute variants and container-query support.

  - `aria-checked:`, `aria-disabled:`, `aria-expanded:`, `aria-selected:`,
    `aria-pressed:` and the arbitrary `aria-[name=value]:` form compile to an
    attribute selector appended to the class (`[aria-expanded="true"]`).
  - `data-[state=open]:` (arbitrary `name=value`) and bare `data-active:`
    (presence) compile to `[data-state="open"]` / `[data-active]`.
  - `@container` (and named `@container/<name>`) mark a query container
    (`container-type: inline-size`); the `@sm:`/`@md:`/`@lg:`/`@xl:`/`@2xl:`
    container-query variants wrap the rule in an `@container (min-width: …)`
    at-rule on Tailwind's container-query scale.

- [#270](https://github.com/fellwork/aihu/pull/270) [`6322593`](https://github.com/fellwork/aihu/commit/63225938452ef14e4e5f86b56a252a2c9d526265) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Add the Tailwind-v4 `divide-x-*` / `divide-y-*` sibling-border utilities to the
  css-engine token table:

  - `divide-x` / `divide-y` — bare forms default to `1px`, emitting the nested
    sibling-border recipe (`& > * + * { border-inline-width | border-block-width: 1px; }`).
  - `divide-x-{0,2,4,8}` / `divide-y-{0,2,4,8}` — width scale →
    `& > * + * { border-inline-width | border-block-width: 0 / 2px / 4px / 8px; }`.
  - `divide-x-reverse` / `divide-y-reverse` — set the
    `--tw-divide-{x,y}-reverse` custom property for Tailwind API parity.

  These reuse the proven `space-x/y` nested `& > * + *` emission path, so they
  minify correctly to `.divide-y-2>*+*{border-block-width:2px}` in the production
  Vite/Lightning pipeline and survive the scoped CSS-nesting path. `cn()` last-wins
  conflict groups are registered per axis. All compile at build time into
  per-component scoped CSS; no runtime cost and no change to browser-bundle size
  budgets (the logic lives in the `aihu-css-core` Rust crate, which does not ship
  to the client).

- [#274](https://github.com/fellwork/aihu/pull/274) [`4b90dfa`](https://github.com/fellwork/aihu/commit/4b90dfa1c22243bc5de9c31cb6e406ab83381bfb) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Add Tailwind `group:` / `peer:` relational-element variants.

  The engine now recognizes the bare `group` / `peer` marker classes plus the
  `group-hover:`, `group-focus:`, `group-focus-visible:`, `group-active:`,
  `group-disabled:`, `peer-hover:`, `peer-focus:`, `peer-focus-visible:`,
  `peer-checked:`, and `peer-disabled:` variant prefixes. `group-*:` compiles to an
  ancestor descendant selector (`.group:hover .group-hover\:bg-primary`) and
  `peer-*:` to a previous-sibling selector (`.peer:checked ~ .peer-checked\:bg-primary`),
  both scoped inside the component's shadow root. The bare `group` / `peer` classes
  are emitted as no-op marker rules so they survive scanning and anchor the
  relationship.

- [#273](https://github.com/fellwork/aihu/pull/273) [`6a84dbb`](https://github.com/fellwork/aihu/commit/6a84dbb5298fd86d715d3ccbf0b88511803980d9) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Add the Tailwind-v4 motion utility family to the css-engine token table:

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

- [#272](https://github.com/fellwork/aihu/pull/272) [`14f3a3e`](https://github.com/fellwork/aihu/commit/14f3a3e4b12a09d396cbe3a537ee67a5cc512049) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Add Tailwind-v4 ring width + ring-offset utilities to the css-engine token table:

  - `ring` (3px default) and `ring-{0,1,2,4,8}` — emit the Tailwind v4 focus-ring
    recipe: a `box-shadow` composed from `--tw-ring-*` custom properties
    (`--tw-ring-shadow: var(--tw-ring-inset) 0 0 0 calc(<n>px + var(--tw-ring-offset-width)) var(--tw-ring-color);`),
    so width, color, and offset compose independently and layer with `shadow-*`.
  - `ring-inset` — sets `--tw-ring-inset: inset;`.
  - `ring-offset-{0,1,2,4,8}` — sets `--tw-ring-offset-width: <n>px;`.

  The existing `ring-<color>` path is unchanged: `ring-blue-500`, `ring-primary`,
  `ring-ring`, etc. still emit `--tw-ring-color: var(--color-*)`. The bare `ring`
  keyword (a width) is matched before the color path so it never collides with a
  color token, and all `ring*` utilities already last-wins under the existing
  `ring` conflict-group prefix.

  Build-time only — the new logic lives in the `aihu-css-core` Rust crate, which
  does not ship to the client, so there is no browser-bundle size impact.

- [#271](https://github.com/fellwork/aihu/pull/271) [`3089577`](https://github.com/fellwork/aihu/commit/30895777d91823005805c66a2f06c2afcf443dde) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Add named/numeric scales for position and typography utilities to the
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

## 0.2.5

### Patch Changes

- [#258](https://github.com/fellwork/aihu/pull/258) [`74273e0`](https://github.com/fellwork/aihu/commit/74273e0a015805f3c878c9b2c7890ed0c80a23fd) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix Bug 6: utility CSS from `@aihu/css-engine` now lands in the bundled `dist/assets/*.css` asset when `viteAihuPlugin({ css: { shadowMode: 'none' } })` is set, so utility classes like `.flex`, `.gap-6`, `.text-lg` actually take effect in the document cascade.

  - `@aihu/compiler`: `aihuCompilerPlugin` now branches on `shadowMode === 'none'` and routes utility CSS through Vite's CSS pipeline via a `virtual:aihu-utility/<hash>.css` virtual import (resolved by the plugin's new `resolveId` + `load` hooks). The `'open' | 'closed'` shadow paths still fold into `host.adoptedStyleSheets` as before — only the no-shadow case changes. Also makes the compiler-binary path resolution lazy (call-time) so the `AIHU_COMPILE_BIN` handshake with `@aihu/css-engine`'s bundled `compileToAst` actually fires.
  - `@aihu/css-engine`: rebuild against the deferred compiler-bin resolver so `compileSfc()` no longer ENOENTs against the missing `packages/css-engine/bin/aihu-compile` on the first call (the AIHU_COMPILE_BIN env var is now read at every call, not captured at module load).

- [#261](https://github.com/fellwork/aihu/pull/261) [`c6860e0`](https://github.com/fellwork/aihu/commit/c6860e022a374b3c5e35aaf8775cbb6332b1b75d) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Externalize `@aihu/compiler` from the rolldown bundle so consumers always use the
  live compiler module (with its current binary-resolution logic) instead of a
  frozen embedded copy. Pre-fix the `compileToAst` from `@aihu/compiler` was
  inlined into `dist/index.js` at build time, freezing a module-scope `binPath`
  constant that resolved at import time to a non-existent
  `node_modules/@aihu/css-engine/bin/aihu-compile` path. Marking `@aihu/compiler`
  external means the bundle now does `import { compileToAst } from "@aihu/compiler"`
  so the consumer-installed compiler module — including any subsequent binary
  resolver fixes — is what runs. Also bumps the workspace dep range to
  `workspace:^` so publish rewrites to a caret range.

- [#259](https://github.com/fellwork/aihu/pull/259) [`5f21125`](https://github.com/fellwork/aihu/commit/5f211252c7500973c6976ca48f29b09ea8aa049b) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix publishing pipeline so `@aihu/css-engine-<platform>` tarballs ship `aihu-css-compile` with the executable bit set. `actions/download-artifact@v4` does not preserve POSIX mode bits, so the `chmod 0755` performed in `build-css-native` was lost in transit and the `publish-css-native` job published `-rw-r--r--` binaries. Consumers on Bun could not auto-repair this (postinstall scripts are blocked by default for untrusted deps), surfacing as a "binary not found" error from `resolveBinary()`. The next release will be the first to ship correctly-mode'd tarballs across all 4 platforms; existing releases stay broken and require the documented `chmod +x` workaround.

- Updated dependencies [[`74273e0`](https://github.com/fellwork/aihu/commit/74273e0a015805f3c878c9b2c7890ed0c80a23fd)]:
  - @aihu/compiler@0.5.4

## 0.2.4

### Patch Changes

- [#253](https://github.com/fellwork/aihu/pull/253) [`d42793b`](https://github.com/fellwork/aihu/commit/d42793b8258d723ae7c80179dcc82e2db8d0afc4) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Forward `shadowMode` through `viteAihuPlugin` for utility-class CSS frameworks.

  - **`@aihu/app`** — new `css.shadowMode` option on `AihuConfig`. When set, it
    forwards to the compiler's per-plugin `shadowMode` injection
    (`'open' | 'closed' | 'none'`). Required for consumers of
    `@aihu/css-engine` (and other cascade-dependent CSS frameworks) so the
    utility classes the compiler folds in are not trapped inside a shadow root.
    Default behaviour is unchanged.
  - **`@aihu/compiler`** — `_maybeCompileUtilityCss` now emits a one-shot
    `console.warn` when `@aihu/css-engine` resolves but `compileSfc()` throws
    (typically: the native `aihu-css-core` binary is unresolvable). Build is
    still non-fatal; previously this case was completely silent and users
    could not discover why their utility classes never emitted.
  - **`@aihu/css-engine`** — README now documents the canonical
    `viteAihuPlugin({ css: { shadowMode: 'none' } })` wiring and points to the
    new `examples/css-engine-utility/` end-to-end example.

- Updated dependencies [[`d42793b`](https://github.com/fellwork/aihu/commit/d42793b8258d723ae7c80179dcc82e2db8d0afc4), [`52a7ee6`](https://github.com/fellwork/aihu/commit/52a7ee600c1f94ac741c01d6d9c0a4a203fc0ef3)]:
  - @aihu/compiler@0.5.3

## 0.2.3

### Patch Changes

- Updated dependencies [[`6ed33f8`](https://github.com/fellwork/aihu/commit/6ed33f80bfdf193382e9fb1d192c0c1d4e6ef069), [`6ed33f8`](https://github.com/fellwork/aihu/commit/6ed33f80bfdf193382e9fb1d192c0c1d4e6ef069)]:
  - @aihu/compiler@0.5.2

## 0.2.2

### Patch Changes

- Updated dependencies [[`e31df0b`](https://github.com/fellwork/aihu/commit/e31df0bbf43cca38d55528bf31d00088897e5579)]:
  - @aihu/compiler@0.5.1

## 0.2.1

### Patch Changes

- [#226](https://github.com/fellwork/aihu/pull/226) [`71ca28e`](https://github.com/fellwork/aihu/commit/71ca28ece93dfcfdad4bd9edda2a2ead415d26f2) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Make `resolveBinary()` robust to a present-but-unusable per-platform stub.
  R6c added `@aihu/css-engine-<platform>` packages as `optionalDependencies`,
  and refreshing `bun.lock` made their in-source PLACEHOLDER `aihu-css-compile`
  resolvable inside the workspace. The old resolver accepted that candidate on
  `existsSync` alone, returned the non-executable placeholder, and then died with
  `EACCES` inside `execFileSync` — never reaching the dev `target/` fallback (CI
  `check` failures across `sfc-e2e`, `css-engine-hook`, and `style-pack`). The
  candidate is now gated on `isUsableExecutable()`: a zero-byte / non-executable
  stub is rejected (POSIX `accessSync(_, X_OK)`; on Windows, a non-empty regular
  file) so resolution falls THROUGH to the monorepo `target/release|debug/`
  binary. The structured "no binary" error is thrown only when BOTH a real
  platform executable AND the dev `target/` are absent. The published-consumer
  path is unchanged: a real per-platform executable is still used when installed.
- Updated dependencies []:
  - @aihu/compiler@0.5.0

## 0.2.0

### Minor Changes

- [#219](https://github.com/fellwork/aihu/pull/219) [`a866af7`](https://github.com/fellwork/aihu/commit/a866af78d41931e28c5b19084342e566ca47bdee) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Ship `@aihu/css-engine`'s native `aihu-css-compile` binary per-platform so the
  package is usable by any npm consumer — not just a monorepo dev clone with a
  Rust toolchain.

  `compile()` / `compileSfc()` shell out to the `aihu-css-compile` CLI executable
  (built from the `aihu-css-core` crate). Previously `resolveBinary()` only
  searched the monorepo's `target/release|debug/`, so a published `npm install
@aihu/css-engine` shipped no binary and `compile()` threw immediately.

  `resolveBinary()` now mirrors `@aihu/server`'s `detectPlatform()`: it maps
  `process.platform`+`process.arch` to a per-platform `optionalDependencies`
  package and resolves the executable's path via
  `createRequire(import.meta.url).resolve('<pkg>/package.json')`. Because the
  binary is invoked as a CLI subprocess (not a napi `.node` addon), the platform
  package ships a raw executable and we resolve its path rather than `require()`-ing
  it. The monorepo `target/` path is retained ONLY as a dev fallback. When the
  platform is supported but the package is absent, a structured error tells the
  user their `optionalDependencies` install was skipped (and how to reinstall);
  unsupported platforms get a build-from-source remedy.

  New per-platform `optionalDependencies` (initial `0.1.2`, binaries produced by
  CI on the release tag):

  - `@aihu/css-engine-darwin-arm64`
  - `@aihu/css-engine-darwin-x64`
  - `@aihu/css-engine-linux-x64-gnu` (glibc)
  - `@aihu/css-engine-win32-x64-msvc`

  Build-time-only package — zero browser-bundle impact, no `.size-limit.json` row.

- [#214](https://github.com/fellwork/aihu/pull/214) [`45b393c`](https://github.com/fellwork/aihu/commit/45b393c3f48758bf82c152bbe6088c63edaa68a6) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Make the two built-in style packs importable both ways. Previously only
  `defineStylePack()` was exported (from `.`); the shipped `styles/*.css` bundles
  were published as `files` but unreachable through `exports` (a bare
  `import '@aihu/css-engine/styles/aihu-default.css'` threw
  `ERR_PACKAGE_PATH_NOT_EXPORTED`).

  New `exports` entries:

  - `./packs` — `aihuDefault` and `aihuGraphite` as `StylePack` objects (the same
    `defineStylePack()` shape external orgs use) plus a `builtinPacks` registry.
    Read `.tokens` / `.dark` or emit `.toCss()`.
  - `./styles/aihu-default.css`, `./styles/aihu-graphite.css` (and a `./styles/*`
    glob) — the CSS bundles now resolve through `exports`, so Vite/bundlers inline
    them directly.

  The `./packs` objects are the SOURCE OF TRUTH for the `styles/*.css` bundles:
  each `.css` file is GENERATED from `pack.toCss()` (`bun run gen:style-packs`,
  wired into the package build + `prepublishOnly`), so the JS objects and the CSS
  files can never drift. A `style-pack.test.ts` parity test asserts
  `pack.toCss()` byte-equals each shipped file.

  Build/dev-time-only package — zero browser-bundle impact, no `.size-limit.json`
  row (the pure-data `./packs` entry rides on the existing `@aihu/css-engine`
  build-dev-only classification).

### Patch Changes

- Updated dependencies [[`574af6d`](https://github.com/fellwork/aihu/commit/574af6d4214889e9b3f7c407a42aa2e53252fddc), [`55298d5`](https://github.com/fellwork/aihu/commit/55298d51f9c6a3723a441d18a71b458e9f2cd035)]:
  - @aihu/compiler@0.5.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`55ce81c`](https://github.com/fellwork/aihu/commit/55ce81ca9ff6e63b0ba7d9eb878f175704096140)]:
  - @aihu/compiler@0.4.1

## 0.1.0

### Minor Changes

- [#187](https://github.com/fellwork/aihu/pull/187) [`31a37ef`](https://github.com/fellwork/aihu/commit/31a37eff5506f913c7081698745eac5092e04463) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Add the AST-consuming scanner and full compile pipeline to `@aihu/css-engine`.
  The scanner walks the compiler's exported SFC AST (via `compileToAst` / the
  `aihu-compile --ast-json` hook), extracting utility classes from static and
  macro forms and deferring reactive `$class={…}` bindings to runtime. Adds a full
  Tailwind v4 utility table (with arbitrary `[…]` bracket values), a scoped
  shadow-DOM emitter, WC-native variants (`host:`, `slotted:`, `slotted-img:`,
  `part-*:`, `host-context-dark:`) plus standard variants (`hover:`, `focus:`,
  `dark:`, `md:`, `[&>div]:`), a `@theme` token registry seeded with aihu brand
  tokens, and an AST-hashed incremental compilation cache. Build-time only — zero
  browser-bundle impact.

- [#185](https://github.com/fellwork/aihu/pull/185) [`eed6ce6`](https://github.com/fellwork/aihu/commit/eed6ce6d600c06d3fa22ea228f3f370c6cebb2dc) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Initial release of `@aihu/css-engine` — the build-time, compile-time CSS engine
  (Tailwind v4 hard-fork, WC-native scoped shadow-DOM output). This bootstrap
  release ships the `@aihu/css-engine` package + the `aihu-css-core` Rust crate
  with a `compile(classes)` entry point. Build-time-only: it adds zero to the
  browser bundle (no CSS-in-JS, no runtime row in `.size-limit.json`).

### Patch Changes

- Updated dependencies [[`faca280`](https://github.com/fellwork/aihu/commit/faca2804cf62c05ffc90ef867faa2058b5e267ad), [`173705b`](https://github.com/fellwork/aihu/commit/173705bde39bdd5b79b7e3665bb91719e0a74e63)]:
  - @aihu/compiler@0.4.0
