/**
 * Tests for `aihu migrate` — HTML-tag → @blockname{} conversion.
 *
 * Scope: v1.0.7 — the four HTML block tags only (`<script setup>`,
 * `<template>`, `<style>`, `<agent>`). The `:attr` / `@event` inline
 * attribute conversions are R5.2b (v1.0.8) territory and are NOT
 * covered here.
 *
 * Routing: Builder R5.2a (Round 5 of aihu-v1-framework). Director r5-sup
 * brief `1e287199-24a8-48f0-a547-ee74b9a04dac`; Investigator R5.1 brief
 * `3025c0c2-19c9-4c63-a183-7613f83d4c21`.
 */

import { describe, expect, it } from 'vitest'
import { migrateFile } from '../src/commands/migrate.ts'

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
