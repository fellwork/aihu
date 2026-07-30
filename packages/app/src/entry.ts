/**
 * Virtual client entry — eliminates the need for a scaffolded `src/main.ts`
 * in the common case (no `provide`/`outletId`/custom `head` customization).
 * Mirrors the CLI's `appMainTs()` output (packages/cli/src/index.ts) line
 * for line; keep the two in sync if either changes.
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
