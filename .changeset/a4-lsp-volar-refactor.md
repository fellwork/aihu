---
"@aihu/language-server": minor
---

Migrate language server from vscode-languageserver to @volar/language-server
(v2.4.28). Adds virtual-file generator for @state block (12 macros), source-map
module using @volar/source-map Mapping<CodeInformation>, and Volar plugin layer
(AihuLanguagePlugin + AihuLanguageServicePlugin). All 124 prior tests preserved;
adds volar-integration.test.ts.
