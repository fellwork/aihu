/**
 * state-wrapper codemod (#487 §7 waves 1+2) — unit tests.
 *
 * Exercises the JS implementation in isolation (no Rust build needed):
 *  1. `$`-macro → wrapper mappings per state-model spec §2/§3, with the
 *     verbatim-body contract (running code is spliced, never re-indented).
 *  2. The nature axis: written props become `let`, others `const`;
 *     `bind:` template bindings count as writes.
 *  3. Bare typed declarations (§3 row 21): reactive → `state()`, inert
 *     mutated → plain `let`, never-written → plain `const`; `keepPlain`
 *     pins a name to the plain lowering.
 *  4. Signal tuples (§7 wave 2): declaration, `x()` reads, `setX(v)` writes
 *     (statement / arrow-body / expression positions), updater desugar,
 *     the object-literal-init parenthesization (config-bag ambiguity), and
 *     the setter-as-value per-pair keep.
 *  5. Abort classes: `mount:`-keyed `$controller`, unmapped macros, and the
 *     statement-call-only gating guard — file left byte-untouched.
 */

import { describe, expect, it } from 'vitest'
import { migrateStateWrappers } from '../../js/codemods/state-wrapper/migrate.ts'

function state(body: string, template = '<div>x</div>'): string {
  return `@state {\n${body}\n}\n\n@template {\n  ${template}\n}\n`
}

describe('state-wrapper codemod — $-macro forms', () => {
  it('migrates $prop with the nature axis (written prop → let)', () => {
    const src = state(
      `  $prop: {\n    count: { type: Number, default: 0 },\n    label: { type: String, default: 'x' },\n  }\n\n  $action: {\n    increment: () => { count++ },\n  }`,
    )
    const out = migrateStateWrappers(src)
    expect(out.skipped).toBe(false)
    expect(out.rewritten).toContain('let count = prop({ default: 0 })')
    expect(out.rewritten).toContain(`const label = prop({ default: 'x' })`)
    expect(out.rewritten).toContain('const increment = action(() => { count++ })')
  })

  it('counts template bind: as a write', () => {
    const src = state(`  name: string = ''`, `<input bind:value={name} />`)
    const out = migrateStateWrappers(src)
    expect(out.rewritten).toContain(`let name = state('')`)
  })

  it('keeps the generic when the default cannot carry the type', () => {
    const src = state(
      `  $prop: {\n    mode: { type: 'a' | 'b', default: 'a' },\n    items: { type: Array, default: [] },\n  }`,
    )
    const out = migrateStateWrappers(src)
    expect(out.rewritten).toContain(`const mode = prop<'a' | 'b'>({ default: 'a' })`)
    expect(out.rewritten).toContain('const items = prop<unknown[]>({ default: [] })')
  })

  it('desugars expose to the §6.1 shorthand', () => {
    const src = state(
      `  $computed: {\n    total: {\n      describe: 'sum',\n      expose: { read: true },\n      value: () => 1,\n    },\n  }\n\n  $action: {\n    go: {\n      describe: 'run',\n      expose: { read: true, write: true },\n      handler: () => {},\n    },\n  }`,
    )
    const out = migrateStateWrappers(src)
    expect(out.rewritten).toContain(`expose: 'read'`)
    expect(out.rewritten).toContain(`expose: 'read write'`)
    expect(out.rewritten).toContain('derived(')
    expect(out.rewritten).toContain('action(')
  })

  it('migrates lifecycle, aria, form, context, effect, route, afterNavigate', () => {
    const src = state(
      [
        `  $lifecycle: {`,
        `    mount: () => { go() },`,
        `    dispose: () => { stop() },`,
        `  }`,
        ``,
        `  $aria: {`,
        `    role: 'dialog',`,
        `  }`,
        ``,
        `  $context: {`,
        `    consume: {`,
        `      theme: { type: 'string' },`,
        `    },`,
        `  }`,
        ``,
        `  $effect: () => { console.log(theme) }`,
        ``,
        `  $route currentRoute`,
        ``,
        `  $afterNavigate((to) => { console.log(to) })`,
      ].join('\n'),
    )
    const out = migrateStateWrappers(src)
    expect(out.rewritten).toContain('onMount(() => { go() })')
    expect(out.rewritten).toContain('onDispose(() => { stop() })')
    expect(out.rewritten).toContain(`aria({\n    role: 'dialog',\n  })`)
    expect(out.rewritten).toContain(`const theme = consume<string>('theme')`)
    expect(out.rewritten).toContain('effect(() => { console.log(theme) })')
    expect(out.rewritten).toContain('const currentRoute = route()')
    expect(out.rewritten).toContain('afterNavigate((to) => { console.log(to) })')
    expect(out.rewritten).not.toContain('$')
  })

  it('renames $extends → base: and $shadow → shadow:', () => {
    const src = state(
      `  $extends: AihuButton\n  $shadow: 'light'\n  $prop: {\n    v: { default: 1 },\n  }`,
    )
    const out = migrateStateWrappers(src)
    expect(out.rewritten).toContain('base: AihuButton')
    expect(out.rewritten).toContain(`shadow: 'light'`)
  })

  it('classifies bare typed declarations (§3 row 21)', () => {
    const src = state(
      `  visible: boolean = false\n  _timer: number | null = null\n  fixed: string = 'k'\n\n  $action: {\n    show: () => { visible = true; _timer = 1 },\n  }`,
      `<p if={visible}>{fixed}</p>`,
    )
    const out = migrateStateWrappers(src)
    expect(out.rewritten).toContain('let visible = state(false)')
    expect(out.rewritten).toContain('let _timer: number | null = null')
    expect(out.rewritten).toContain(`const fixed: string = 'k'`)
  })

  it('honors keepPlain', () => {
    const src = state(
      `  hydratedFrom: string = 'client'\n\n  $lifecycle: {\n    mount: () => { hydratedFrom = 'server' },\n  }\n  $prop: {\n    v: { default: 1 },\n  }`,
      `<p>{hydratedFrom}</p>`,
    )
    const out = migrateStateWrappers(src, { keepPlain: ['hydratedFrom'] })
    expect(out.rewritten).toContain(`let hydratedFrom: string = 'client'`)
  })
})

describe('state-wrapper codemod — signal tuples', () => {
  it('rewrites the declaration and every call site', () => {
    const src = `@state {
  import { signal } from '@aihu/signals'

  const [count, setCount] = signal(0)

  const inc = () => setCount(c => c + 1)
  const reset = () => { setCount(0) }
  const report = () => console.log(count() + 1)
}

@template {
  <button on:click={() => setCount(count + 1)}>{count}</button>
}
`
    const out = migrateStateWrappers(src)
    expect(out.rewritten).toContain('let count = state(0)')
    expect(out.rewritten).toContain('const inc = () => { count = count + 1 }')
    expect(out.rewritten).toContain('const reset = () => { count = 0 }')
    expect(out.rewritten).toContain('console.log(count + 1)')
    expect(out.rewritten).toContain('on:click={() => { count = count + 1 }}')
    expect(out.rewritten).not.toContain('signal(')
    expect(out.rewritten).not.toContain('import { signal }')
    expect(out.renamedSetters).toEqual([{ getter: 'count', setter: 'setCount' }])
  })

  it('parenthesizes an object-literal initial value (config-bag ambiguity)', () => {
    const src = state(
      `  const [cache, setCache] = signal({})\n  const put = () => { setCache({ ...cache(), a: 1 }) }`,
    )
    const out = migrateStateWrappers(src)
    expect(out.rewritten).toContain('let cache = state(({}))')
    expect(out.rewritten).toContain('cache = { ...cache, a: 1 }')
  })

  it('keeps a pair whose setter is used as a value', () => {
    const src = state(
      `  import { provide } from '@aihu/context'\n  const [items, setItems] = signal([])\n  provide(Ctx, [items, setItems])`,
    )
    const out = migrateStateWrappers(src)
    expect(out.rewritten).toContain('const [items, setItems] = signal([])')
    expect(out.warnings.some((w) => w.includes('setter is used as a value'))).toBe(true)
  })
})

describe('state-wrapper codemod — abort classes', () => {
  it('aborts on a mount:-keyed $controller', () => {
    const src = state(
      `  $controller: {\n    obs: {\n      mount: (host) => { return () => {} },\n    },\n  }`,
    )
    const out = migrateStateWrappers(src)
    expect(out.skipped).toBe(true)
    expect(out.rewritten).toBe(src)
    expect(out.warnings.some((w) => w.includes('no wrapper equivalent'))).toBe(true)
  })

  it('aborts a statement-call-only migration (the has_bindings gate)', () => {
    const src = state(
      `  $context: {\n    provide: {\n      theme: { value: 'light', type: 'string' },\n    },\n  }`,
    )
    const out = migrateStateWrappers(src)
    expect(out.skipped).toBe(true)
    expect(out.rewritten).toBe(src)
  })

  it('aborts on an unmapped $-form', () => {
    const src = state(`  $shared foo\n  $prop: {\n    v: { default: 1 },\n  }`)
    const out = migrateStateWrappers(src)
    expect(out.skipped).toBe(true)
    expect(out.rewritten).toBe(src)
  })

  it('is a no-op on an already-migrated file', () => {
    const src = state(`  let count = state(0)\n  const inc = action(() => { count++ })`)
    const out = migrateStateWrappers(src)
    expect(out.skipped).toBe(true)
    expect(out.rewritten).toBe(src)
  })
})
