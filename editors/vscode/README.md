# Scribe SFC — VS Code extension

Syntax highlighting and snippets for `.scribe` Single-File Components.

## Features

- TextMate grammar for `.scribe` files
- Region highlighting for `<contract>`, `<script setup>`, `<server setup>`, `<template>`, and `<style>` blocks
- Embedded language support — TypeScript inside `<script setup>`, HTML inside `<template>`, CSS inside `<style>`
- Contract-aware highlighting for `input`, `state`, `action`, the four primitive types, and `enum(…)` variants
- Snippets: `contract-block`, `contract-input`, `contract-input-enum`, `contract-action`, `contract-state`, `script-setup`

## Install (local)

The extension is **not published to the Marketplace** in this round. Install it
directly from this folder:

1. Open VS Code.
2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
3. Run **"Developer: Install Extension from Location…"** (or
   **"Developer: Install Extension from Folder…"** on older builds).
4. Select the `editors/vscode/` folder in this repository.
5. Reload VS Code when prompted.

You should now see Scribe-aware highlighting on any file ending in `.scribe`.

## Develop

To iterate on the grammar:

1. Open `editors/vscode/` in a VS Code window.
2. Press `F5` to launch an Extension Development Host.
3. Open a `.scribe` file in the host window to test changes.

The grammar lives at `syntaxes/scribe.tmLanguage.json`. Snippets at
`snippets/scribe.json`. Language config at `language-configuration.json`.

## Status

`0.0.1` — first release. No diagnostics, no language server, no formatter. Just
highlighting + snippets. Future versions may integrate with `scribe-compile` for
inline error reporting.
