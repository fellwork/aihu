/**
 * The shadow-mode vocabulary — deliberately a LEAF module with zero imports.
 *
 * `ssr-string.ts` (the `@aihu/runtime/ssr` server subpath) needs
 * `SHADOW_ROOT_MODE`, and `@aihu/server` imports that subpath so both renderers
 * share one child serializer. Had these stayed in `types.ts`, that import would
 * drag `types.ts`'s `@aihu/arbor` / `@aihu/signals` type imports behind it, and
 * every package whose tsconfig maps `@aihu/server` to source would need path
 * entries for the whole transitive graph — TypeScript replaces a base config's
 * `paths` rather than merging them, so none of it can be inherited.
 *
 * Keeping this module import-free is what stops that cascade. Do not add
 * imports here.
 *
 * `types.ts` re-exports both names, so every existing importer is unaffected.
 */

/**
 * Rendering mode for the custom element — a BINARY choice (DA4 #437).
 *
 * - `'shadow'` → `attachShadow({ mode: 'open' })`. `this.shadowRoot` is the
 *                root (non-null). Open is the only browser mode aihu uses:
 *                composition and hydration read `this.shadowRoot`, which a
 *                closed root nulls out — that is why no `'closed'` value
 *                exists. **Default for leaf components.**
 * - `'light'`  → No shadow root; content renders into the element itself.
 *                `this.shadowRoot` is `null` — detection is unambiguous.
 *                No style scoping. **Default for pages and layouts.**
 */
export type ShadowMode = 'light' | 'shadow'

/**
 * The DOM `ShadowRootMode` aihu attaches with — the SINGLE SOURCE for that
 * value across the whole framework.
 *
 * `ShadowMode` above ('light' | 'shadow') is aihu's AUTHORING vocabulary;
 * `ShadowRootMode` ('open' | 'closed') is a different DOM enum that merely
 * shares the word "mode". They meet in exactly one place — the moment a root
 * is actually attached — and `'open'` is never something an author writes.
 *
 * Declarative Shadow DOM makes that boundary reachable from a second place:
 * the server's `<template shadowrootmode="…">` must name the SAME value the
 * client attaches with, or a prerendered component adopts into a root the
 * runtime cannot see. Two bare `"open"` literals in two packages would be one
 * invariant encoded twice with nothing testing that they agree — the shape
 * that already produced the mangled arbor wire format, `_injectLightScopeId`,
 * and `contextSetup`.
 *
 * `@aihu/server` does not (and should not) depend on this browser package, so
 * the SSR emitter cannot import this constant. It therefore declares its own
 * and is pinned to this one by a cross-package parity test — the documented
 * single-source arrangement, never an unwatched duplicate.
 */
export const SHADOW_ROOT_MODE = 'open' as const
