/**
 * Migration guide body. Ported from apps/docs/src/content/docs/migration.md.
 *
 * The historical passes (v0 → v1 → v2, template grammar v2, the DA4 shadow
 * flip) are kept close to verbatim — they are the reference for anyone holding
 * older source, the diagnostic codes are still what the compiler emits, and
 * nothing about them has changed. The retired-form tables are the most
 * valuable part of the page and are preserved in full.
 *
 * ADDED: the current in-flight migration the old page could not have covered —
 * `aihu.config.ts` → the inline config object in `vite.config.ts`. This is the
 * one a reader on a recent version is most likely to actually hit, and the
 * standalone file is on its way out framework-wide, so it leads.
 *
 * NOTE ON SOURCE FORM: this is a JS template literal, so a literal dollar-brace
 * sequence would open an interpolation. Every macro spelling below is written
 * so no dollar sign is ever immediately followed by an open brace.
 */
export const MIGRATION = `# Migration

This page consolidates every breaking change in the <code>.aihu</code> surface and maps each old form to its replacement. Sources written against a retired surface will not compile against the current <code>@aihu/compiler</code>.

> <strong>Codemod first.</strong> Most of these are mechanical. Run <code>npx aihu migrate --v2 &lt;files…&gt;</code> (add <code>--dry-run</code> to preview), then read on for the cases it flags but cannot resolve. The passes are idempotent — re-running on migrated source is a no-op.

## Current: <code>aihu.config.ts</code> → <code>vite.config.ts</code>

<code>vite.config.ts</code> is the canonical home for app and build config. The standalone <code>aihu.config.ts</code> is a <strong>legacy fallback</strong> and is being removed. If you have one, inline it:

~~~ts
// before — aihu.config.ts
import { defineConfig } from '@aihu/app'
export default defineConfig({
  output: 'static',
  site: { url: 'https://example.com' },
  css: { shadowMode: 'light' },
})

// vite.config.ts
import aihuConfig from './aihu.config.ts'
export default defineConfig({ plugins: [viteAihuPlugin(aihuConfig)] })
~~~

~~~ts
// after — one file
import { viteAihuPlugin } from '@aihu/app'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    viteAihuPlugin({
      output: 'static',
      site: { url: 'https://example.com' },
      css: { shadowMode: 'light' },
    }),
  ],
})
~~~

Two things to check when you delete the file: your <code>tsconfig.json</code> <code>include</code> list probably names it, and comments elsewhere may point readers at it for <code>site.url</code>.

<strong>One exception.</strong> <code>defineAihuConfig</code> / <code>aihu.config.ts</code> remains the live registration path for <code>@aihu/plugin</code>-shaped <em>compiler</em> plugins. <code>viteAihuPlugin()</code>'s own <code>plugins</code> field takes <em>Vite</em> plugins — a different thing — so a compiler plugin still belongs in the standalone config. See [Authoring Plugins](/guides/authoring-plugins).

## Block framing — no HTML tags (C107)

v0 SFCs used HTML-tag framing. Blocks are <code>@name { … }</code>:

~~~
// before (v0)
<script setup>
  const [count, setCount] = signal(0)
</script>
<template>
  <button>{count}</button>
</template>

// after
@state {
  import { signal } from '@aihu/signals'
  const [count, setCount] = signal(0)
}
@template {
  <button>{count}</button>
}
~~~

The recognized blocks are <code>@state</code>, <code>@template</code>, <code>@style</code>, <code>@agent</code>, <code>@route</code>, and <code>@meta</code>. Any other <code>@name</code> block is <strong>C204</strong> — including <code>@props</code>, whose hint steers you to the prop macro inside <code>@state</code>.

## Template grammar v2 — the prefix-less template (C601–C611)

> <strong>One rule:</strong> naked keywords, naked HTML attributes, naked framework vocabulary. <code>{expr}</code> braces mean expression; quoted strings mean static; the dollar prefix retreats to <code>@state</code> macros only. Every retired form is a hard compile error with a precise <code>fix:</code> hint — there is no deprecation period.

| Retired form | Code | Write instead |
|---|---|---|
| <code>{#if e}…{:else}…{/if}</code> | C601 | <code>if={e}</code> on the governed element; <code>elseif={e}</code> / <code>else</code> on the immediately following siblings; wrap multi-element branches in <code>&lt;group&gt;</code> |
| <code>{#each list as item}…{/each}</code> | C602 | <code>each={item, i of list} key={keyExpr}</code> on the repeated element (or <code>&lt;group&gt;</code>); the empty body moves to an <code>empty</code> sibling |
| <code>{@html expr}</code> | C603 | the <code>html={expr}</code> attribute |
| <code>{{ident}}</code> double-brace | C604 | single braces <code>{ident}</code>; an expression starting with an object literal needs a space |
| <code>&lt;$if&gt;</code> / <code>&lt;$else&gt;</code> | C605 | <code>if={…}</code> / <code>else</code> attributes |
| <code>$if=</code> / <code>$each=</code> / <code>$let=</code> | C606 | <code>if={e}</code>; <code>each={item of list}</code> — item-first, <code>of</code>-separated |
| any other dollar-attribute (<code>$on.click</code>, <code>$bind.value</code>, <code>$class:x</code>, <code>$key</code>, <code>$show</code>, <code>$html</code>, <code>$ref</code>, …) | C607 | <code>on:click={h}</code> (modifiers: <code>on:click.prevent</code>), <code>bind:value={x}</code>, <code>class:x={c}</code>, <code>key={…}</code>, <code>show={…}</code>, <code>html={…}</code>, <code>ref={…}</code>, bare <code>once</code>/<code>raw</code>, plain <code>class={…}</code> |
| <code>&lt;$link&gt;</code> | C608 | <code>&lt;a href={…} prefetch="…"&gt;</code> — carries SPA navigation, <code>prefetch</code>, <code>replace</code>, <code>aria-current</code>; auto-opts out for <code>target="_blank"</code>, <code>download</code>, external origins and non-http(s) schemes; add <code>reload</code> to force a document load |
| any other dollar-element | C609 | the naked word: <code>&lt;slot&gt;</code>, <code>&lt;suspense&gt;</code>, <code>&lt;shield&gt;</code>, <code>&lt;outlet&gt;</code>, <code>&lt;router&gt;</code>, <code>&lt;navigate&gt;</code>, <code>&lt;guard&gt;</code>, <code>&lt;warp&gt;</code>, plus <code>&lt;group&gt;</code> |
| <code>elseif</code>/<code>else</code>/<code>empty</code> not the immediate sibling | C610 | move the branch element directly after its chain head; only whitespace and comments may sit between |
| unknown non-hyphenated element | C611 | fix the typo, or hyphenate the component tag |

Advisory lints: <strong>W601</strong> — keyless <code>each</code> whose body contains components or stateful elements (add <code>key={…}</code>); <strong>W602</strong> — non-empty static string on a boolean attribute (<code>disabled="false"</code> is truthy in HTML).

## Macro collection form (C440 / C500)

Per-declaration macros inside <code>@state</code> collapsed into <strong>collection form</strong> — one object per macro kind:

~~~
// before
$lifecycle.mount: {
  connect()
}
$lifecycle.dispose(() => disconnect())

// after
$lifecycle: {
  mount: () => {
    connect()
  },
  dispose: () => disconnect(),
}
~~~

Agent metadata folded in the same way: per-name macros are retired in favour of <code>describe:</code> / <code>expose:</code> on <code>@state</code> collection entries, and the <code>@agent</code> block is dropped entirely when nothing but scope and rate-limit remain.

### Cases the codemod cannot resolve

- <strong>The action colon form</strong> — rewrite by hand into a collection entry carrying <code>describe</code>, <code>expose</code> and <code>handler</code>.
- <strong>Agent metadata naming a plain <code>signal()</code> binding</strong> — <code>expose:</code> and <code>describe:</code> attach to <em>collection entries</em>. A raw <code>const [x, setX] = signal(…)</code> has no entry to carry them; wrap the value in a computed entry, or accept that the name is not agent-exposed.
- <strong>Stale template spellings the codemod does not own</strong> — dot-form attribute bindings and dot-form class toggles.

## The binary shadow API (the DA4 flip)

> <strong>Breaking, one change with two faces.</strong> The shadow value set collapsed to a binary <code>'light' | 'shadow'</code> — <code>'open'</code>, <code>'closed'</code> and <code>'none'</code> are gone — <strong>and</strong> pages and layouts now default to <code>'light'</code>.

Token migration is mechanical: <code>'open'</code> → <code>'shadow'</code>, <code>'none'</code> → <code>'light'</code>, <code>'closed'</code> → <code>'shadow'</code> (it never actually encapsulated). This applies to the shadow macro, the plugin-global <code>css: { shadowMode }</code>, the runtime's <code>defineElement(tag, Ctor, { shadowMode })</code>, and the CLI's <code>--shadow</code> flag.

<code>'closed'</code> is gone rather than renamed for a concrete reason: a closed root makes <code>this.shadowRoot === null</code>, which is exactly how aihu detects light DOM — so a closed root was misclassified and its content rendered into the host anyway.

<strong>Why light-DOM pages.</strong> AI crawlers do not execute JavaScript, so a page's primary content must reach them as server-rendered <em>light</em> DOM. Declarative Shadow DOM does not reliably fix this — spec-compliant extractors read a <code>&lt;template shadowrootmode&gt;</code> subtree as empty.

<strong>What to check after upgrading.</strong>

- Retired tokens fail loudly: the old shadow values are a <strong>C471</strong> compile error, an old <code>css.shadowMode</code> throws at config validation, and an old <code>--shadow</code> warns and falls back.
- To put a page back in shadow DOM, pin it in <code>@state</code>. The pin outranks everything, including plugin-global config.
- <strong>Page <code>@style</code> blocks now join the global cascade.</strong> A light-DOM page's styles are no longer trapped in a shadow root, so bare element selectors (<code>h1 { … }</code>) apply <strong>app-wide</strong>. Scope them under a page root class.

See [Styling](/guides/styling) for how light-DOM components are isolated with <code>@scope</code>.

## Type-checking after migration

Type-checking <code>.aihu</code> files compiles each to a virtual TypeScript sidecar with <code>@aihu/compiler</code> — and that compiler must be the <strong>same version</strong> your app builds with. Otherwise <code>aihu-tsc</code> may resolve an older compiler from its own dependency tree and reject perfectly valid new-grammar files, reporting only:

~~~
N .aihu file(s) could not be compiled, so nothing in them was type-checked
~~~

Align the versions and the message goes away.

## See also

- [Authoring Components](/guides/authoring-components) — the current SFC surface
- [Styling](/guides/styling) · [Theming](/guides/theming)
- [Composition & Injection](/guides/composition) — tag naming and C450
`
