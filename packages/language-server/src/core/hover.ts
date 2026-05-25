/**
 * packages/language-server/src/core/hover.ts
 *
 * Static hover lookup table for aihu macro keywords.
 * Used by the LSP server textDocument/hover handler.
 *
 * Editor-agnostic: returns Markdown strings + does pure position math. The
 * connection layer wraps the result in a protocol `Hover`. Clean seam for a
 * future Volar virtual-code hover provider.
 */

const HOVER_TABLE: Record<string, string> = {
  $prop: [
    '**aihu macro: `$prop`**',
    '',
    'Declares reactive prop signals from parent attributes.',
    '',
    'Compiles to:',
    '```typescript',
    'const name = computed(() => ctx.attrs.name)',
    '```',
    '',
    '[v2 spec](docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md)',
  ].join('\n'),

  $computed: [
    '**aihu macro: `$computed`**',
    '',
    'Declares a derived signal.',
    '',
    'Compiles to:',
    '```typescript',
    'const name = computed(() => expr)',
    '```',
    '',
    '[v2 spec](docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md)',
  ].join('\n'),

  $action: [
    '**aihu macro: `$action`**',
    '',
    'Declares a callable action in component scope.',
    '',
    'Compiles to:',
    '```typescript',
    'function name(args) { return batch(() => { body }) }',
    '```',
    '',
    '[v2 spec](docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md)',
  ].join('\n'),

  $resource: [
    '**aihu macro: `$resource`**',
    '',
    'Declares an async data resource signal.',
    '',
    'Compiles to:',
    '```typescript',
    'const name = createResource(() => expr)',
    '```',
    '',
    '[v2 spec](docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md)',
  ].join('\n'),

  $effect: [
    '**aihu macro: `$effect`**',
    '',
    'Declares a reactive side effect.',
    '',
    'Compiles to:',
    '```typescript',
    'effect(() => { body })',
    '```',
    '',
    '[v2 spec](docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md)',
  ].join('\n'),

  $lifecycle: [
    '**aihu macro: `$lifecycle`**',
    '',
    'Declares lifecycle hooks (mount, dispose, adopt, attributeChange).',
    '',
    'Compiles to:',
    '```typescript',
    'onMount(() => { ... })',
    'onCleanup(() => { ... })',
    '```',
    '',
    '[v2 spec](docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md)',
  ].join('\n'),

  $if: [
    '**aihu template directive: `$if` / `{#if}`**',
    '',
    'Conditional rendering.',
    '',
    'Compiles to:',
    '```typescript',
    'branch(condition, () => trueBranch)',
    '```',
    '',
    '[Template spec](docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md)',
  ].join('\n'),

  $each: [
    '**aihu template directive: `$each` / `{#each}`**',
    '',
    'List rendering.',
    '',
    'Compiles to:',
    '```typescript',
    'branch.each(items, (item) => leaf(...))',
    '```',
    '',
    '[Template spec](docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md)',
  ].join('\n'),

  $html: [
    '**aihu template directive: `$html` / `{@html}`**',
    '',
    'Raw HTML injection. Use with trusted content only.',
    '',
    'Compiles to:',
    '```typescript',
    'leaf({ nodeValue: htmlContent })',
    '```',
    '',
    '[Template spec](docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md)',
  ].join('\n'),

  $show: [
    '**aihu template directive: `$show`**',
    '',
    'Toggles element visibility without removing it from the DOM.',
    '',
    'Compiles to:',
    '```typescript',
    'el.style.display = condition ? "" : "none"',
    '```',
    '',
    '[Template spec](docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md)',
  ].join('\n'),

  $on: [
    '**aihu template directive: `$on`**',
    '',
    'Attaches an event listener to a DOM element.',
    '',
    'Compiles to:',
    '```typescript',
    'element.addEventListener("event", handler)',
    '```',
    '',
    'Usage: `$on.click={handler}`',
    '',
    '[Template spec](docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md)',
  ].join('\n'),

  $bind: [
    '**aihu template directive: `$bind`**',
    '',
    'Two-way binding between a signal and an element attribute.',
    '',
    'Compiles to:',
    '```typescript',
    '// two-way binding via signal setter',
    'el.addEventListener("input", e => setSignal(e.target.value))',
    '```',
    '',
    'Usage: `$bind.value={signal}`',
    '',
    '[Template spec](docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md)',
  ].join('\n'),

  $emit: [
    '**aihu macro: `$emit`**',
    '',
    'Declares and dispatches typed custom events.',
    '',
    'Compiles to:',
    '```typescript',
    'this.dispatchEvent(new CustomEvent(name, { detail: payload }))',
    '```',
    '',
    'Usage: `$emit.name(payload)`',
    '',
    '[v2 spec](docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md)',
  ].join('\n'),
}

export function getBlockContext(
  lines: string[],
  lineIndex: number,
): 'state' | 'template' | 'unknown' {
  for (let i = lineIndex; i >= 0; i--) {
    const trimmed = lines[i]!.trimStart()
    if (/^@state\s*\{/.test(trimmed)) return 'state'
    if (/^@template\s*\{/.test(trimmed)) return 'template'
    if (/^@(style|agent|route)\s*\{/.test(trimmed)) return 'unknown'
  }
  return 'unknown'
}

export function getMacroAtPosition(lineText: string, character: number): string | null {
  let m: RegExpExecArray | null
  const namespacedRe = /\$(on|bind)(?:[.:][A-Za-z_$][\w$]*)?/g
  while ((m = namespacedRe.exec(lineText)) !== null) {
    if (character >= m.index && character <= m.index + m[0].length) {
      return `$${m[1]!}`
    }
  }
  const bareRe = /\$(prop|computed|action|resource|effect|lifecycle|emit|if|each|html|show)\b/g
  while ((m = bareRe.exec(lineText)) !== null) {
    if (character >= m.index && character <= m.index + m[0].length) {
      return `$${m[1]!}`
    }
  }
  const blockRe = /\{(?:#(if|each)|@(html))\b/g
  while ((m = blockRe.exec(lineText)) !== null) {
    if (character >= m.index && character <= m.index + m[0].length) {
      const keyword = m[1] ?? m[2]!
      return `$${keyword}`
    }
  }
  return null
}

export function getHoverContent(macro: string): string | null {
  return HOVER_TABLE[macro] ?? null
}
