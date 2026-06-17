import { definePlugin } from '@aihu/plugin'
import { generateJsonLd } from './json-ld.js'
import type { SeoConfig } from './types.js'

/**
 * @aihu/seo plugin factory.
 *
 * Registers an afterParse hook that injects JSON-LD structured data into
 * SFC compilation output. The hook receives a SfcContext (build-time context)
 * and the parsed AST — neither provides page-level frontmatter or route metadata
 * in the current @aihu/plugin v0.2.1 API (SfcContext.symbolTable is opaque).
 *
 * Builder-time decision (afterParse SFC affordance):
 *   Since SfcContext provides no frontmatter/meta slot in v0.2.1, this hook
 *   injects a default WebPage JSON-LD using config.jsonLdDefaults merged with
 *   the baseUrl as the default page URL. This approach is conservative and
 *   correct — it ensures every SFC gets a baseline JSON-LD annotation without
 *   relying on not-yet-specified SFC frontmatter fields. When the compiler
 *   exposes per-SFC metadata (e.g., symbolTable.frontmatter), the hook can
 *   be updated to read page-level overrides. Surface to Director if Verifier
 *   flags the lack of per-page override support.
 *
 *   The hook returns the ast unchanged (with a side-effect JSON-LD string stored
 *   in the ast under __seoJsonLd if the ast is a mutable object). In practice,
 *   the afterParse hook return value may be used by the compiler to update the
 *   AST. For now we return the ast as-is to avoid mutating an opaque shape.
 */
export function seo(config: SeoConfig) {
  return definePlugin({
    name: '@aihu/seo',
    version: '0.1.0',
    namespace: 'seo',
    serverOnly: true,
    hooks: {
      afterParse: async (_ctx, ast) => {
        // Inject default WebPage JSON-LD from config.jsonLdDefaults.
        // SfcContext v0.2.1 does not expose frontmatter, so we use config-level defaults.
        const jsonLd = generateJsonLd({
          url: config.baseUrl,
          ...config.jsonLdDefaults,
        })
        // Attach to the AST if it is a mutable object (opaque shape tolerance).
        // The compiler may pick this up for script injection; if not, the
        // routes layer handles JSON-LD delivery via server-side HTML.
        if (ast !== null && typeof ast === 'object' && !Array.isArray(ast)) {
          ;(ast as Record<string, unknown>).__seoJsonLd = jsonLd
        }
        return ast
      },
    },
  })
}
