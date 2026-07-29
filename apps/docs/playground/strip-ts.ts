/**
 * Real TypeScript stripper for playground preview execution (#554).
 *
 * Uses `ts.transpileModule` to transform TypeScript to pure JavaScript,
 * replacing the regex-based `stripTs` chain.
 */

import ts from 'typescript'

export function stripTs(js: string): string {
  // Strip import lines for @aihu packages (available globally in the iframe preview).
  const preprocessed = js
    .replace(/^import type .+$/gm, '')
    .replace(/^import .+ from ['"]@aihu\/[^'"]+['"];?$/gm, '')
    .replace(/^export /gm, '')

  const transpiled = ts.transpileModule(preprocessed, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      removeComments: false,
    },
  })

  return transpiled.outputText
}
