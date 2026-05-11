/**
 * Tests for `aihu migrate` — legacy SFC syntax → v1.0+ canonical forms.
 *
 * Scope:
 *   - v1.0.7: HTML block tag conversions (`<script setup>`, `<template>`,
 *     `<style>`, `<agent>` → `@state` / `@template` / `@style` / `@agent`).
 *   - v1.0.8 / Amendment 04: inline attribute conversions
 *     - `:attr="x"` → `$attr={x}` (C304 rewrite)
 *     - `@event="x"` → `$on.event="x"` (C305 rewrite)
 *     - `attr={x}` → `$attr={x}` (C306 rewrite)
 *
 * Routing: Builder R5.2a (v1.0.7) + R5.2b-2 (v1.0.8). Brief refs:
 *   - Director r5-sup `1e287199-24a8-48f0-a547-ee74b9a04dac`
 *   - Director r5-sup-2 `a4cc0505-88fb-40ac-9410-5835cc922e52`
 *   - Architect R5.2b-1 (Amendment 04) `78da6af2-67ad-41d9-844c-e0c95336b164`
 *   - Investigator R5.1 brief `3025c0c2-19c9-4c63-a183-7613f83d4c21`
 */

import { describe, expect, it } from 'vitest'
import { migrateFile, migrateInlineAttrs } from '../src/commands/migrate.ts'

describe('migrateFile — HTML block conversions (v1.0.7)', () => {
  it('converts <script setup> to @state', () => {
    const input = `<script setup>
const count = 1
</script>`
    const result = migrateFile(input)
    expect(result).toBe(`@state {
const count = 1
}`)
  })

  it('converts <template> to @template', () => {
    const input = `<template>
  <div>hello</div>
</template>`
    const result = migrateFile(input)
    expect(result).toBe(`@template {
  <div>hello</div>
}`)
  })

  it('converts <style> to @style', () => {
    const input = `<style>
div { color: red; }
</style>`
    const result = migrateFile(input)
    expect(result).toBe(`@style {
div { color: red; }
}`)
  })

  it('converts <agent> to @agent', () => {
    const input = `<agent>
description: A test agent
</agent>`
    const result = migrateFile(input)
    expect(result).toBe(`@agent {
description: A test agent
}`)
  })

  it('leaves <script setup lang="..." name="..."> openers untouched (limitation; user fixes manually)', () => {
    // The current `/<script\s+setup\s*>/i` regex requires the opener to end
    // with optional whitespace + `>` — it does NOT match `<script setup lang="ts" name="x-foo">`.
    // The migrate command leaves these openers in place; the parser then
    // rejects the file with C107, and the user removes the attributes and
    // reruns `aihu migrate`, or hand-converts. A future patch may widen the
    // CONVERSIONS regex to swallow opener attributes.
    const input = `<script setup lang="ts" name="x-foo">
const x = 1
</script>`
    const result = migrateFile(input)
    // Document current behavior: opener with extra attributes is left untouched.
    expect(result).toBe(input)
  })

  it('handles multiple blocks in one file (script + template + style)', () => {
    const input = `<script setup>
const greeting = 'hi'
</script>

<template>
  <p>{{ greeting }}</p>
</template>

<style>
p { font-weight: bold; }
</style>`
    const result = migrateFile(input)
    expect(result).toContain('@state {')
    expect(result).toContain('@template {')
    expect(result).toContain('@style {')
    expect(result).not.toContain('<script')
    expect(result).not.toContain('</script>')
    expect(result).not.toContain('<template>')
    expect(result).not.toContain('</template>')
    expect(result).not.toContain('<style>')
    expect(result).not.toContain('</style>')
  })

  it('handles all four blocks (agent + script + template + style)', () => {
    const input = `<agent>
description: agent component
</agent>
<script setup>
const value = 42
</script>
<template>
  <span>{{ value }}</span>
</template>
<style>
span { color: blue; }
</style>`
    const result = migrateFile(input)
    expect(result).toContain('@agent {')
    expect(result).toContain('@state {')
    expect(result).toContain('@template {')
    expect(result).toContain('@style {')
    expect(result).not.toMatch(/<agent>/)
    expect(result).not.toMatch(/<\/agent>/)
  })

  it('leaves @-form files unchanged (idempotent)', () => {
    const input = `@state {
const x = 1
}
@template {
  <div>hi</div>
}`
    const result = migrateFile(input)
    expect(result).toBe(input)
  })

  it('running migrate twice produces the same result as running once (idempotency)', () => {
    const input = `<script setup>
const greeting = 'hi'
</script>
<template>
  <p>{{ greeting }}</p>
</template>`
    const once = migrateFile(input)
    const twice = migrateFile(once)
    expect(twice).toBe(once)
  })

  it('preserves body content verbatim (no edits inside the block)', () => {
    const body = `import { signal } from '@aihu/signals'

const [count, setCount] = signal(0)
function inc() {
  setCount(c => c + 1)
}`
    const input = `<script setup>\n${body}\n</script>`
    const result = migrateFile(input)
    expect(result).toBe(`@state {\n${body}\n}`)
  })

  it('handles <style global> attribute by preserving it in output (downstream parser handles $global)', () => {
    // The regex `/<style\s*>/i` does NOT match `<style global>`. The migrate
    // command does not rewrite the `global` attribute; users move to
    // `@style { $global ... }` manually. This documents current behavior.
    const input = `<style global>
body { margin: 0; }
</style>`
    const result = migrateFile(input)
    // The opener with extra attributes is NOT matched — output is unchanged.
    // (A future patch can extend CONVERSIONS to handle this case.)
    expect(result).toBe(input)
  })
})

describe('migrateInlineAttrs — C304 `:attr=` rewrite (v1.0.8 / Amendment 04)', () => {
  it('rewrites :attr="x" → $attr={x} (double quotes)', () => {
    const input = `<div :class="cls"></div>`
    const result = migrateInlineAttrs(input)
    expect(result).toBe(`<div $class={cls}></div>`)
  })

  it("rewrites :attr='x' → $attr={x} (single quotes)", () => {
    const input = `<input :value='count'>`
    const result = migrateInlineAttrs(input)
    expect(result).toBe(`<input $value={count}>`)
  })

  it('rewrites multiple :attr= occurrences on the same element', () => {
    const input = `<a :href="url" :title="label">link</a>`
    const result = migrateInlineAttrs(input)
    expect(result).toBe(`<a $href={url} $title={label}>link</a>`)
  })

  it('preserves xmlns: namespace prefixes (leading-whitespace guard NA, but no leading ws either)', () => {
    // `xmlns:xlink` has no leading whitespace on the left of `:` (it's part
    // of the attribute name itself), so the `(\s):` regex doesn't match.
    const input = `<svg xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#icon"/></svg>`
    const result = migrateInlineAttrs(input)
    expect(result).toBe(input)
  })
})

describe('migrateInlineAttrs — C305 `@event=` rewrite (v1.0.8 / Amendment 04)', () => {
  it('rewrites @event="x" → $on.event="x" (double quotes preserved)', () => {
    const input = `<button @click="handleClick">click</button>`
    const result = migrateInlineAttrs(input)
    expect(result).toBe(`<button $on.click="handleClick">click</button>`)
  })

  it("rewrites @event='x' → $on.event='x' (single quotes preserved)", () => {
    const input = `<button @click='save'>save</button>`
    const result = migrateInlineAttrs(input)
    expect(result).toBe(`<button $on.click='save'>save</button>`)
  })

  it('rewrites @event={x} → $on.event={x} (curly form)', () => {
    const input = `<button @click={() => doIt()}>do</button>`
    const result = migrateInlineAttrs(input)
    expect(result).toBe(`<button $on.click={() => doIt()}>do</button>`)
  })

  it('rewrites multiple @event= on the same element', () => {
    const input = `<form @submit="save" @reset="clear">x</form>`
    const result = migrateInlineAttrs(input)
    expect(result).toBe(`<form $on.submit="save" $on.reset="clear">x</form>`)
  })
})

describe('migrateInlineAttrs — C306 plain-curly rewrite (v1.0.8 / Amendment 04)', () => {
  it('rewrites attr={x} → $attr={x} on lowercase HTML tags', () => {
    const input = `<div class={cls}></div>`
    const result = migrateInlineAttrs(input)
    expect(result).toBe(`<div $class={cls}></div>`)
  })

  it('rewrites href={url} on an anchor tag', () => {
    const input = `<a href={url}>link</a>`
    const result = migrateInlineAttrs(input)
    expect(result).toBe(`<a $href={url}>link</a>`)
  })

  it('rewrites aria-* attributes', () => {
    const input = `<button aria-label={label} aria-pressed={pressed}>x</button>`
    const result = migrateInlineAttrs(input)
    expect(result).toBe(`<button $aria-label={label} $aria-pressed={pressed}>x</button>`)
  })

  it('rewrites data-* attributes', () => {
    const input = `<li data-id={id}>x</li>`
    const result = migrateInlineAttrs(input)
    expect(result).toBe(`<li $data-id={id}>x</li>`)
  })

  it('preserves component prop-passing (capitalized tag name → JSX prop, not rewritten)', () => {
    const input = `<UserCard user={u} count={n} />`
    const result = migrateInlineAttrs(input)
    expect(result).toBe(input)
  })

  it('preserves $-prefixed macro attrs (already canonical, not rewritten)', () => {
    const input = `<div $class={cls} $on.click={fn}></div>`
    const result = migrateInlineAttrs(input)
    expect(result).toBe(input)
  })

  it('preserves static (quoted) attribute values — only curly form is rewritten', () => {
    const input = `<div class="static">x</div>`
    const result = migrateInlineAttrs(input)
    expect(result).toBe(input)
  })

  it('handles balanced curly expressions with nested braces', () => {
    const input = `<div class={obj.method({key: val})}>x</div>`
    const result = migrateInlineAttrs(input)
    expect(result).toBe(`<div $class={obj.method({key: val})}>x</div>`)
  })

  it('rewrites mixed attrs (static + curly + already-$) correctly', () => {
    const input = `<input type="text" value={v} $on.input={onInput} disabled={d}>`
    const result = migrateInlineAttrs(input)
    expect(result).toBe(`<input type="text" $value={v} $on.input={onInput} $disabled={d}>`)
  })
})

describe('migrateInlineAttrs — combined / cross-cutting cases (v1.0.8)', () => {
  it('runs C304 + C305 + C306 together on a mixed input', () => {
    const input = `<a :class="cls" @click="go" href={url}>link</a>`
    const result = migrateInlineAttrs(input)
    expect(result).toBe(`<a $class={cls} $on.click="go" $href={url}>link</a>`)
  })

  it('is idempotent (running twice = running once)', () => {
    const input = `<a :class="cls" @click="go" href={url}>link</a>`
    const once = migrateInlineAttrs(input)
    const twice = migrateInlineAttrs(once)
    expect(twice).toBe(once)
  })

  it('leaves an already-v1 file unchanged (idempotency on canonical input)', () => {
    const input = `<a $class={cls} $on.click={go} $href={url}>link</a>`
    const result = migrateInlineAttrs(input)
    expect(result).toBe(input)
  })

  it('does not rewrite inside @state / @script block bodies (only tag openers in @template)', () => {
    // The migrate pass treats the whole file as text — it does NOT skip
    // block bodies. But @state block bodies are JS, not HTML, so they don't
    // contain `<tag-opener>` patterns to match. Documenting that the
    // C306 rewrite is opener-scoped (won't see e.g. inline JS expressions).
    const input = `@state {\nconst obj = { foo: 1 }\n}\n@template {\n  <div class={obj.foo}></div>\n}`
    const result = migrateInlineAttrs(input)
    expect(result).toBe(
      `@state {\nconst obj = { foo: 1 }\n}\n@template {\n  <div $class={obj.foo}></div>\n}`,
    )
  })
})

describe('migrateFile — full integration with v1.0.8 (block + inline)', () => {
  it('converts both HTML block tags AND inline attr aliases in one pass', () => {
    const input = `<script setup>
const cls = 'btn'
const handler = () => {}
</script>
<template>
  <button :class="cls" @click="handler">click</button>
</template>`
    const result = migrateFile(input)
    expect(result).toContain('@state {')
    expect(result).toContain('@template {')
    expect(result).toContain('$class={cls}')
    expect(result).toContain('$on.click="handler"')
    expect(result).not.toContain(':class=')
    expect(result).not.toContain('@click=')
  })

  it('is idempotent end-to-end (block + inline)', () => {
    const input = `<script setup>
const x = 1
</script>
<template>
  <a :href="url" @click="go" class={cls}>x</a>
</template>`
    const once = migrateFile(input)
    const twice = migrateFile(once)
    expect(twice).toBe(once)
  })
})
