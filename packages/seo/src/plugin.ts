import { definePlugin } from '@aihu/plugin'
import { generateJsonLd } from '@aihu-plugin/agent-readiness'
import type { SeoConfig } from './types.js'

/**
 * @aihu/seo plugin factory.
 *
 * @deprecated `@aihu/seo` is a compatibility shim over
 * `@aihu-plugin/agent-readiness` (#430). For config-level JSON-LD `<head>`
 * injection use `viteAgentReadinessIntegration({ jsonLd: [...] })`; for
 * hand-rolled emission use `generateJsonLd` from the same package.
 *
 * Registers an afterParse hook that injects JSON-LD structured data into
 * SFC compilation output. The hook receives a SfcContext (build-time context)
 * and the parsed AST — neither provides page-level frontmatter or route metadata
 * in the current @aihu/plugin API (SfcContext.symbolTable is opaque), so the
 * hook injects a default WebPage JSON-LD using config.jsonLdDefaults merged
 * with the baseUrl as the default page URL.
 *
 * The hook returns the ast unchanged (with a side-effect JSON-LD string stored
 * in the ast under __seoJsonLd if the ast is a mutable object).
 */
export function seo(config: SeoConfig) {
  return definePlugin({
    name: '@aihu/seo',
    version: '1.0.0',
    namespace: 'seo',
    serverOnly: true,
    hooks: {
      afterParse: async (_ctx, ast) => {
        // Inject default WebPage JSON-LD from config.jsonLdDefaults.
        // SfcContext does not expose frontmatter, so we use config-level defaults.
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
