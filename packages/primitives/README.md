# @aihu/primitives

> **Aihu** — agentic discovery and interaction, for human purpose.

aihu headless behavior primitives — WAI-ARIA APG patterns as vanilla custom elements, zero CSS.

<!-- BEGIN_HANDWRITTEN: prose -->
The **headless behavior layer** on top of the aihu CSS engine. Every primitive is a
vanilla custom element that manages focus, keyboard interaction, ARIA wiring, and
controlled/uncontrolled state — the WAI-ARIA APG patterns — while emitting **NO CSS**.
Consumers style via the CSS engine's `cn()` + style packs.

State lives on `@aihu/signals`; DOM structure comes from `@aihu/arbor`; focus/ARIA use
native DOM APIs; cross-component coordination uses a self-contained DOM-walk context
(`@aihu/primitives/context`).

### Surface

| Entry | What it is |
|---|---|
| `@aihu/primitives/context` | `createDomContext` / `provideContext` / `injectContext` — live DOM-walk ancestor traversal, Symbol-keyed, signal-backed |
| `@aihu/primitives/presence-gate` | mount/unmount with exit-animation hold |
| `@aihu/primitives/form-control` | disabled/required/invalid + ARIA association |
| `@aihu/primitives/config-provider` | colorScheme/density/dir via reactive DOM context |
| `@aihu/primitives/roving-focus` | arrow-key roving tabindex (orientation/loop/RTL) |
| `@aihu/primitives/collection` | DOM-ordered descendant registration |
| `@aihu/primitives/dialog` | dialog-root + pieces (focus-trap, return-focus, escape) — APG Dialog Modal |
| `@aihu/primitives/tooltip` | tooltip-root + pieces (reuses css-engine `position()` shim) — APG Tooltip |
| `@aihu/primitives/button` | headless button base (ARIA/keyboard/toggle/disabled) — APG Button |

### Local development

```bash
bun run build    # rolldown multi-entry → dist/<entry>.js
bun run test     # vitest (keyboard + APG conformance)
bun run typecheck
```
<!-- END_HANDWRITTEN: prose -->

## Install

<!-- BEGIN_AUTOGEN: install -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

```bash
npm install @aihu/primitives
# or
bun add @aihu/primitives
```

<sub><i>Auto-generated against `@aihu/primitives@0.0.2`.</i></sub>

<!-- END_AUTOGEN: install -->

## Package facts

<!-- BEGIN_AUTOGEN: stats -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

| | |
|---|---|
| **Version** | `0.0.2` |
| **Tier** | E — Held private (unmapped tier) |
| **Published files** | 3 entries |
| **License** | MIT |

<sub><i>Auto-generated against `@aihu/primitives@0.0.2`.</i></sub>

<!-- END_AUTOGEN: stats -->

## Exports

<!-- BEGIN_AUTOGEN: exports -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

| Subpath | ESM | CJS |
|---|---|---|
| `.` | `./dist/index.js` | `—` |
| `./context` | `./dist/dom-context.js` | `—` |
| `./presence-gate` | `./dist/presence-gate.js` | `—` |
| `./form-control` | `./dist/form-control.js` | `—` |
| `./config-provider` | `./dist/config-provider.js` | `—` |
| `./roving-focus` | `./dist/roving-focus.js` | `—` |
| `./collection` | `./dist/collection.js` | `—` |
| `./dialog` | `./dist/dialog.js` | `—` |
| `./tooltip` | `./dist/tooltip.js` | `—` |
| `./button` | `./dist/button.js` | `—` |

<sub><i>Auto-generated against `@aihu/primitives@0.0.2`.</i></sub>

<!-- END_AUTOGEN: exports -->

## Dependencies

<!-- BEGIN_AUTOGEN: deps -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

**Dependencies:**

- `@aihu/signals` — `workspace:*`
- `@aihu/arbor` — `workspace:*`
- `@aihu/css-engine` — `workspace:*`

<sub><i>Auto-generated against `@aihu/primitives@0.0.2`.</i></sub>

<!-- END_AUTOGEN: deps -->

## See also

<!-- BEGIN_AUTOGEN: see-also -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

- [Aihu framework root](../../README.md)
- [v1.1 roadmap](../../docs/roadmap/SUMMARY.md)

<sub><i>Auto-generated against `@aihu/primitives@0.0.2`.</i></sub>

<!-- END_AUTOGEN: see-also -->

## License

<!-- BEGIN_AUTOGEN: license -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

MIT — see [LICENSE](../../LICENSE).

<sub><i>Auto-generated against `@aihu/primitives@0.0.2`.</i></sub>

<!-- END_AUTOGEN: license -->
