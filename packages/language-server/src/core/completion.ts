/**
 * packages/language-server/src/core/completion.ts
 *
 * LSP completion items for aihu v2 macro-kind collection-form snippets.
 * Triggered by '$' inside @state block, '@' at top level.
 *
 * Uses inline numeric constants for CompletionItemKind and InsertTextFormat
 * to avoid importing vscode-languageserver at module load time (enables testing
 * without the vscode-languageserver package installed, and keeps this module
 * editor-agnostic — the clean seam for a future Volar adoption).
 */

// CompletionItemKind.Snippet = 15, InsertTextFormat.Snippet = 2
const SNIPPET_KIND = 15
const SNIPPET_FORMAT = 2

export interface LspCompletionItem {
  label: string
  kind: number
  insertTextFormat: number
  detail: string
  sortText: string
  insertText: string
}

/** v2 macro-kind snippet completions (triggered by '$' in @state block). */
export const STATE_MACRO_COMPLETIONS: LspCompletionItem[] = [
  {
    label: '$prop',
    kind: SNIPPET_KIND,
    insertTextFormat: SNIPPET_FORMAT,
    detail: 'v2 collection-form prop declarations',
    sortText: '0_$prop',
    insertText: [
      '$prop: {',
      "  ${1:name}: { default: ${2:undefined}, describe: '${3:description}' },",
      '}',
    ].join('\n'),
  },
  {
    label: '$computed',
    kind: SNIPPET_KIND,
    insertTextFormat: SNIPPET_FORMAT,
    detail: 'v2 collection-form computed declarations',
    sortText: '0_$computed',
    insertText: ['$computed: {', '  ${1:name}: () => ${2:expression},', '}'].join('\n'),
  },
  {
    label: '$action',
    kind: SNIPPET_KIND,
    insertTextFormat: SNIPPET_FORMAT,
    detail: 'v2 collection-form action declarations',
    sortText: '0_$action',
    insertText: ['$action: {', '  ${1:name}: (${2:args}) => { ${3:body} },', '}'].join('\n'),
  },
  {
    label: '$resource',
    kind: SNIPPET_KIND,
    insertTextFormat: SNIPPET_FORMAT,
    detail: 'v2 collection-form resource declarations',
    sortText: '0_$resource',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: VS Code snippet format uses ${N:placeholder} syntax
    insertText: ['$resource: {', '  ${1:name}: () => ${2:fetchExpr()},', '}'].join('\n'),
  },
  {
    label: '$effect',
    kind: SNIPPET_KIND,
    insertTextFormat: SNIPPET_FORMAT,
    detail: 'v2 anonymous effect declaration',
    sortText: '0_$effect',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: VS Code snippet format uses ${N:placeholder} syntax
    insertText: ['$effect: () => {', '  ${1:body}', '}'].join('\n'),
  },
  {
    label: '$lifecycle',
    kind: SNIPPET_KIND,
    insertTextFormat: SNIPPET_FORMAT,
    detail: 'v2 collection-form lifecycle hooks',
    sortText: '0_$lifecycle',
    insertText: [
      '$lifecycle: {',
      '  mount: () => { ${1:initBody} },',
      '  dispose: () => { ${2:cleanupBody} },',
      '}',
    ].join('\n'),
  },
  {
    label: '$emit',
    kind: SNIPPET_KIND,
    insertTextFormat: SNIPPET_FORMAT,
    detail: 'typed custom event declarations',
    sortText: '0_$emit',
    insertText: ['$emit: {', '  ${1:eventName}: (payload: ${2:PayloadType}) => void', '}'].join(
      '\n',
    ),
  },
  {
    label: '$on',
    kind: SNIPPET_KIND,
    insertTextFormat: SNIPPET_FORMAT,
    detail: 'event listener attribute (template)',
    sortText: '0_$on',
    insertText: '$on.${1:click}={${2:handler}}',
  },
  {
    label: '$bind',
    kind: SNIPPET_KIND,
    insertTextFormat: SNIPPET_FORMAT,
    detail: 'two-way attribute binding (template)',
    sortText: '0_$bind',
    insertText: '$bind.${1:value}={${2:signal}}',
  },
]

/** Top-level block completions (triggered by '@' at top level). */
export const BLOCK_COMPLETIONS: LspCompletionItem[] = [
  {
    label: '@state',
    kind: SNIPPET_KIND,
    insertTextFormat: SNIPPET_FORMAT,
    detail: 'aihu @state block',
    sortText: '0_@state',
    insertText: '@state',
  },
  {
    label: '@template',
    kind: SNIPPET_KIND,
    insertTextFormat: SNIPPET_FORMAT,
    detail: 'aihu @template block',
    sortText: '0_@template',
    insertText: '@template',
  },
  {
    label: '@style',
    kind: SNIPPET_KIND,
    insertTextFormat: SNIPPET_FORMAT,
    detail: 'aihu @style block',
    sortText: '0_@style',
    insertText: '@style',
  },
  {
    label: '@agent',
    kind: SNIPPET_KIND,
    insertTextFormat: SNIPPET_FORMAT,
    detail: 'aihu @agent block for MCP tool exposure',
    sortText: '0_@agent',
    insertText: '@agent',
  },
  {
    label: '@route',
    kind: SNIPPET_KIND,
    insertTextFormat: SNIPPET_FORMAT,
    detail: 'aihu @route block for file-based routing',
    sortText: '0_@route',
    insertText: '@route',
  },
]
