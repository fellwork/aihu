/**
 * Virtual client entry — eliminates the need for a scaffolded `src/main.ts`
 * in the common case (no `provide`/custom `head` customization).
 *
 * `outletId` is no longer in that exclusion list: it is a fact about the
 * DOCUMENT rather than a live JS value, so it can be expressed declaratively in
 * the aihu config and threaded through ({@link entrySource}). That matters
 * because two build-time paths — the SSG prerender and the `output: 'ssr'`
 * Worker — also splice into it, and before the config key existed the only way
 * to move the outlet was `createApp({ outletId })` in a hand-written
 * `src/main.ts`, which neither of them can see.
 *
 * The no-outletId form is byte-identical to the CLI's `appMainTs()` output
 * (packages/cli/src/index.ts); keep the two in sync if either changes. The
 * scaffold emits `<div id="outlet"></div>` and no `app.outletId`, so it takes
 * that form.
 */

/** The specifier a consumer (or index.html) references. */
export const ENTRY_VIRTUAL_ID = 'virtual:aihu-entry'

/**
 * `\0`-prefixed per Vite's convention: blocks other plugins' resolvers from
 * claiming the id, and Vite refuses to serve `\0`-prefixed paths directly
 * over HTTP — see https://vite.dev/guide/api-plugin.html#virtual-modules-convention.
 */
export const ENTRY_RESOLVED_ID = `\0${ENTRY_VIRTUAL_ID}`

/** Source served for `ENTRY_RESOLVED_ID` — byte-identical to `appMainTs()`. */
export const ENTRY_SOURCE = "import { createApp } from '@aihu/app/client'\n\ncreateApp()\n"

/**
 * Source served for `ENTRY_RESOLVED_ID`, given the config's `app.outletId`.
 *
 * With no configured id this returns {@link ENTRY_SOURCE} unchanged, so the
 * default path is byte-identical to what it has always emitted. With one, the
 * virtual entry passes it to `createApp` — otherwise a project that set
 * `app.outletId` would get a prerender/Worker splicing the configured id and a
 * client still mounting `#outlet`, which is the same class of divergence this
 * key exists to remove.
 *
 * The id is embedded with `JSON.stringify`, not interpolated: it comes from a
 * config file, and an apostrophe in it would otherwise emit a syntax error into
 * the module graph.
 */
export function entrySource(outletId?: string): string {
  if (outletId === undefined) return ENTRY_SOURCE
  return (
    "import { createApp } from '@aihu/app/client'\n\n" +
    `createApp({ outletId: ${JSON.stringify(outletId)} })\n`
  )
}

/**
 * Inject `<script type="module" src="virtual:aihu-entry">` before `</body>`,
 * unless `hasUserEntry` is true (a real `src/main.ts` exists — full eject,
 * not a partial override, because `AppConfig` fields like `provide` are live
 * JS values that can't be expressed declaratively for the virtual entry to
 * thread through) or the document already has a module script tag (respect
 * a hand-authored entry of any kind rather than doubling up).
 */
export function injectEntryScript(html: string, hasUserEntry: boolean): string {
  if (hasUserEntry) return html
  if (/<script[^>]*type=["']module["']/.test(html)) return html
  if (!html.includes('</body>')) return html
  return html.replace(
    '</body>',
    `    <script type="module" src="${ENTRY_VIRTUAL_ID}"></script>\n  </body>`,
  )
}
