/**
 * Regression suite for the `js/polynomial-redos` (CWE-1333) hardening pass in
 * `js/index.ts` — see the "Regex hardening" note at the top of that file.
 *
 * Two halves, and BOTH matter:
 *
 *  1. Behaviour preservation. Every pattern that changed is replayed here in
 *     its ORIGINAL form and diffed against the shipped one across a corpus of
 *     real compiler output shapes plus the awkward edges (multi-line imports,
 *     `import type`, aliases, CRLF, indentation, empty specifier lists, several
 *     imports from the same module). A redos-safe regex that quietly stops
 *     matching valid `.aihu` output is a worse bug than the one it fixed.
 *
 *  2. The fix itself. Each distinct ambiguity shape gets its adversarial input
 *     — the pump string CodeQL named — under a wall-clock budget. The ORIGINAL
 *     patterns take seconds on these; anything near the budget means a rewrite
 *     regressed back to a re-scanning shape.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  _buildDeferredHydration,
  _buildStaticIsland,
  _foldCssEngineStyles,
  _foldSsrCssExport,
  _injectAutoWiring,
  _passivizeOutlet,
} from '../js/index.ts'

// ── The patterns as they shipped BEFORE this pass ───────────────────────────
// Kept verbatim so the diff is against the real prior behaviour, not a
// paraphrase of it.
const OLD = {
  runtimeCapture: /import\s*\{([^}]*)\}\s*from\s*'@aihu\/runtime'/,
  arborCapture: /import\s*\{([^}]*)\}\s*from\s*'@aihu\/arbor'/,
  arborPlain: /import\s*\{[^}]*\}\s*from\s*'@aihu\/arbor'/,
  signalsCapture: /import\s*\{([^}]*)\}\s*from\s*'@aihu\/signals'/,
  signalsValue: /import\s+\{[^}]*\}\s+from\s+'@aihu\/signals'/,
  signalsType: /import\s+type\s+\{[^}]*\}\s+from\s+'@aihu\/signals'/,
  signalsTypeCapture: /(import\s+type\s+\{[^}]*\}\s+from\s+'@aihu\/signals')/,
  runtimeLine: /^\s*import\s*\{[^}]*\}\s*from\s*'@aihu\/runtime'\s*;?\s*$/m,
  anySignals: /import.*from\s*'@aihu\/signals'/,
} as const

const NEW = {
  runtimeCapture: /import\s*\{([^{}]*)\}\s*from\s*'@aihu\/runtime'/,
  arborCapture: /import\s*\{([^{}]*)\}\s*from\s*'@aihu\/arbor'/,
  arborPlain: /import\s*\{[^{}]*\}\s*from\s*'@aihu\/arbor'/,
  signalsCapture: /import\s*\{([^{}]*)\}\s*from\s*'@aihu\/signals'/,
  signalsValue: /import\s+\{[^{}]*\}\s+from\s+'@aihu\/signals'/,
  signalsType: /import\s+type\s+\{[^{}]*\}\s+from\s+'@aihu\/signals'/,
  signalsTypeCapture: /(import\s+type\s+\{[^{}]*\}\s+from\s+'@aihu\/signals')/,
  runtimeLine: /^[^\S\r\n]*import\s*\{[^{}]*\}\s*from\s*'@aihu\/runtime'(?:\s*;)?\s*$/m,
  anySignals: /^[^\S\n]*import\b[^\n]*from[^\S\n]*'@aihu\/signals'/m,
} as const

// ── Corpus: what the Rust codegen and the JS rewrites actually produce ──────

const COMPILED_STATIC = `import { branch, leaf, slot } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

defineElement('x-msg', defineComponent((_ctx) => {
  const message = 'hello'
  return branch('p', undefined, [leaf(message)])
}))
`

const COMPILED_INTERACTIVE = `import { branch, leaf } from '@aihu/arbor'
import { signal } from '@aihu/signals'
import { defineComponent, defineElement } from '@aihu/runtime'

defineElement('x-counter', defineComponent((_ctx) => {
  const [count, setCount] = signal(0)
  return branch('span', undefined, [leaf(String(count()))])
}))
`

const COMPILED_TYPE_ONLY_SIGNALS = `import { branch } from '@aihu/arbor'
import type { Signal } from '@aihu/signals'
import { defineComponent, defineElement } from '@aihu/runtime'

defineElement('x-t', defineComponent((_ctx) => branch('p', undefined, [])))
`

const COMPILED_MULTILINE_IMPORT = `import {
  branch,
  leaf,
  slot,
} from '@aihu/arbor'
import {
  defineComponent,
  defineElement,
  onMount,
} from '@aihu/runtime'

defineElement('x-multi', defineComponent((_ctx) => branch('p', undefined, [])))
`

const COMPILED_WITH_STYLE = `import { branch, leaf } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

const __style__ = new CSSStyleSheet();
__style__.replaceSync(\`p { color: red }
.a { --x: 1 }\`);

defineElement('x-styled', defineComponent((ctx) => {
  (ctx.host as ShadowRoot).adoptedStyleSheets = [__style__];
  return branch('p', undefined, [leaf('hi')])
}))
export const __aihu_css__ = \`p { color: red }\`
`

// The exact reactive boundary emitted for `<outlet>` (codegen/emit.rs),
// mirrored from tests/layout-mode.test.ts.
const COMPILED_LAYOUT = `import { branch, leaf, slot } from '@aihu/arbor'
import { effect } from '@aihu/signals'
import { defineComponent, defineElement, onMount, onCleanup } from '@aihu/runtime'
import * as __aihuRouter from '@aihu/router'

const createOutletBoundary = () => {
  const host = branch('div', { 'data-aihu-outlet': '' }, []);
  onMount(() => {
    const el = host && host.el;
    if (!el) return () => {};
    let cleanup = null;
    const stop = effect(() => {
      const m = __aihuRouter.useRoute();
      if (cleanup) { cleanup(); cleanup = null; }
      while (el.firstChild) el.removeChild(el.firstChild);
      if (!m) return;
    });
    return () => { if (cleanup) cleanup(); stop && stop(); };
  });
  return host;
};

defineElement('aihu-layout-app', defineComponent((_ctx) => {
  return branch('div', { class: 'app-shell' }, [
    branch('main', undefined, [createOutletBoundary()])
  ])
}))
`

/**
 * Text a `.aihu` author controls, verbatim in the compiled module. This is the
 * data-flow the CodeQL alerts traced: `leaf('…')` from a template text node,
 * a `@style` body inside `__style__.replaceSync(\`…\`)`.
 */
const COMPILED_HOSTILE_TEXT = `import { branch, leaf } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

const __style__ = new CSSStyleSheet();
__style__.replaceSync(\`.x::after { content: "import{ } from '@aihu/runtime'" }\`);

defineElement('x-evil', defineComponent((ctx) => {
  return branch('p', undefined, [leaf('import{import{import{ { } base: defineComponent({')])
}))
`

const CORPUS: readonly string[] = [
  '',
  COMPILED_STATIC,
  COMPILED_INTERACTIVE,
  COMPILED_TYPE_ONLY_SIGNALS,
  COMPILED_MULTILINE_IMPORT,
  COMPILED_WITH_STYLE,
  COMPILED_LAYOUT,
  COMPILED_HOSTILE_TEXT,
  // Whitespace / punctuation variants of the import line.
  "import {a} from '@aihu/runtime'\n",
  "import{a}from'@aihu/runtime'\n",
  "import  {  a ,  b  }  from  '@aihu/runtime'  \n",
  "import { } from '@aihu/runtime'\n",
  "import {} from '@aihu/runtime'\n",
  "import { a as b, c as d } from '@aihu/runtime'\n",
  "  import { a } from '@aihu/runtime'\n",
  "\timport { a } from '@aihu/runtime';\n",
  "import { a } from '@aihu/runtime';",
  "import { a } from '@aihu/runtime'",
  "import { a } from '@aihu/runtime'\r\n",
  "import { a } from '@aihu/runtime' ;  \n",
  // Two imports from the same module — leftmost must win identically.
  "import { a } from '@aihu/runtime'\nimport { b } from '@aihu/runtime'\n",
  // Decoy: another module first.
  "import { a } from 'other'\nimport { b } from '@aihu/runtime'\n",
  // Object literals adjacent to imports (the `[^}]` vs `[^{}]` boundary).
  "import { a } from 'x'\nconst o = { p: 1 }\nimport { b } from '@aihu/runtime'\n",
  "const o = { p: 1 }; import { b } from '@aihu/runtime'\n",
  // signals shapes
  "import type { Signal } from '@aihu/signals'\n",
  "import type {Signal} from '@aihu/signals'\n",
  "import { signal } from '@aihu/signals'\n",
  "import { signal, effect } from '@aihu/signals'\n",
  "import type { Signal } from '@aihu/signals'\nimport { signal } from '@aihu/signals'\n",
  "import * as S from '@aihu/signals'\n",
  "import '@aihu/signals'\n",
  "export { signal } from '@aihu/signals'\n",
  "import{signal}from'@aihu/signals'\n",
  "import{signal,effect}from'@aihu/signals'\n",
  "import type{Signal}from'@aihu/signals'\n",
  "import  type  { Signal }  from  '@aihu/signals'\n",
  "import {\n  signal,\n} from '@aihu/signals'\n",
  // arbor shapes
  "import { branch } from '@aihu/arbor'\n",
  "import { branch, leaf, slot, mount } from '@aihu/arbor'\n",
  // No match at all.
  'export const x = 1\n',
]

function execSnapshot(re: RegExp, s: string): string {
  const m = re.exec(s)
  return m === null ? 'null' : JSON.stringify([m.index, ...m])
}

describe('behaviour preservation — every rewritten pattern matches identically', () => {
  for (const key of Object.keys(OLD) as (keyof typeof OLD)[]) {
    it(`${key}: old and new agree on the whole corpus`, () => {
      for (const s of CORPUS) {
        expect(execSnapshot(NEW[key], s), `subject: ${JSON.stringify(s)}`).toBe(
          execSnapshot(OLD[key], s),
        )
      }
    })
  }
})

/**
 * Three inputs DO change meaning. Each is unreachable from the Rust codegen
 * (`codegen/emit.rs` builds every module as `merged_imports` + body, so the
 * import block is the head of the file and each import owns its own line), and
 * each narrowing is what makes the pattern linear. Pinned here so a future
 * reader sees them as decisions rather than discovering them as surprises.
 */
describe('behaviour preservation — the three deliberate narrowings', () => {
  it('a `{` inside the specifier list no longer matches — invalid JS only', () => {
    const subject = "import {{} from '@aihu/runtime'"
    expect(OLD.runtimeCapture.test(subject)).toBe(true)
    expect(NEW.runtimeCapture.test(subject)).toBe(false)
    // …while every legal specifier list is unaffected.
    for (const legal of [
      "import { a } from '@aihu/runtime'",
      "import { a as b } from '@aihu/runtime'",
      "import {\n a,\n b,\n} from '@aihu/runtime'",
      "import {} from '@aihu/runtime'",
    ]) {
      expect(NEW.runtimeCapture.exec(legal)?.[1]).toBe(OLD.runtimeCapture.exec(legal)?.[1])
    }
  })

  it('a template text node planting a bare `{` no longer corrupts the rewrite', () => {
    // A `.aihu` author writing the literal text `import {` compiles to
    // `leaf('import {')`. `[^}]` ran straight through the string literal and
    // the newline after it and hoovered everything up to the NEXT `}` into the
    // specifier list — so the rewrite emitted `import { '), import {, branch,
    // mount } from '@aihu/arbor'`, which is not valid JS. `[^{}]` stops at the
    // planted brace and matches the real import. Same one-character change,
    // and it is a correctness fix as much as a ReDoS fix.
    const subject = "leaf('import {')\nimport { branch } from '@aihu/arbor'\n"
    expect(OLD.arborCapture.exec(subject)?.[1]).toBe("')\nimport { branch ")
    expect(NEW.arborCapture.exec(subject)?.[1]).toBe(' branch ')
    expect(_injectAutoWiring(subject)).toContain("import { branch, mount } from '@aihu/arbor'")
    // …and the planted text is left exactly as authored.
    expect(_injectAutoWiring(subject)).toContain("leaf('import {')")

    for (const [mod, pattern] of [
      ["'@aihu/runtime'", NEW.runtimeCapture],
      ["'@aihu/signals'", NEW.signalsCapture],
    ] as const) {
      const s2 = `leaf('import {')\nimport { a } from ${mod}\n`
      expect(pattern.exec(s2)?.[1]).toBe(' a ')
    }
    const typed = "leaf('import type {')\nimport type { Signal } from '@aihu/signals'\n"
    expect(OLD.signalsTypeCapture.exec(typed)?.index).toBe(6)
    expect(NEW.signalsTypeCapture.exec(typed)?.index).toBe(22)
  })

  it('planted braces do not corrupt any branch of _injectAutoWiring', () => {
    // Each subject drives a different branch: no signals import at all, an
    // existing value import, an existing type-only import. All three used to
    // match from INSIDE the `leaf('…')` string literal.
    expect(_injectAutoWiring("leaf('import {')\nimport { branch } from '@aihu/arbor'\n")).toBe(
      "leaf('import {')\n" +
        "import { branch, mount } from '@aihu/arbor'\n" +
        "import { signal } from '@aihu/signals'\n" +
        '_setMount(mount)\n_setSignal(signal)\n\n',
    )
    expect(
      _injectAutoWiring(
        "leaf('import {')\nimport { branch } from '@aihu/arbor'\nimport { signal } from '@aihu/signals'\n",
      ),
    ).toBe(
      "leaf('import {')\n" +
        "import { branch, mount } from '@aihu/arbor'\n" +
        "import { signal } from '@aihu/signals'\n" +
        '_setMount(mount)\n_setSignal(signal)\n\n',
    )
    expect(
      _injectAutoWiring(
        "leaf('import type {')\nimport { branch } from '@aihu/arbor'\nimport type { Signal } from '@aihu/signals'\n",
      ),
    ).toBe(
      "leaf('import type {')\n" +
        "import { branch, mount } from '@aihu/arbor'\n" +
        "import type { Signal } from '@aihu/signals'\n" +
        "import { signal } from '@aihu/signals'\n" +
        '_setMount(mount)\n_setSignal(signal)\n\n',
    )
  })

  it('blank lines BEFORE the runtime import are no longer swallowed with it', () => {
    const subject = "\n\nimport { a } from '@aihu/runtime'\nx"
    expect(subject.replace(OLD.runtimeLine, '')).toBe('\nx')
    expect(subject.replace(NEW.runtimeLine, '')).toBe('\n\n\nx')
    // Indentation still is, and the trailing side is untouched — `(?:\s*;)?\s*$`
    // matches exactly the spans `\s*;?\s*$` did.
    for (const s of [
      "  import { a } from '@aihu/runtime'\nx",
      "import { a } from '@aihu/runtime';\n\n\nx",
      "import { a } from '@aihu/runtime'\n\n\nx",
      "import { a } from '@aihu/runtime' ; \nx",
    ]) {
      expect(s.replace(NEW.runtimeLine, '')).toBe(s.replace(OLD.runtimeLine, ''))
    }
  })

  it('the any-signals probe now requires the import to own its line', () => {
    const midLine = "const s = 'x'; import { a } from '@aihu/signals'"
    expect(OLD.anySignals.test(midLine)).toBe(true)
    expect(NEW.anySignals.test(midLine)).toBe(false)
    // Every line-owning form the codegen emits still reads as "has a signals
    // import", including the whitespace-free shape that the `\s+` probe ahead
    // of this branch deliberately misses.
    for (const s of [
      "import { signal } from '@aihu/signals'",
      "import{signal}from'@aihu/signals'",
      "import * as S from '@aihu/signals'",
      "import type { Signal } from '@aihu/signals'",
      "  import { signal } from '@aihu/signals'",
      "import { branch } from '@aihu/arbor'\nimport { signal } from '@aihu/signals'\n",
    ]) {
      expect(NEW.anySignals.test(s), `subject: ${JSON.stringify(s)}`).toBe(true)
    }
  })
})

describe('behaviour preservation — the restructured helpers', () => {
  it('_passivizeOutlet collapses the boundary exactly as the old regex did', () => {
    const old = (code: string) =>
      code.replace(
        /const createOutletBoundary = \(\) => \{[\s\S]*?return host;\s*\n\};/,
        `const createOutletBoundary = () => branch('div', { 'data-aihu-outlet': '' }, []);`,
      )
    for (const s of CORPUS) expect(_passivizeOutlet(s)).toBe(old(s))
    expect(_passivizeOutlet(COMPILED_LAYOUT)).toBe(old(COMPILED_LAYOUT))
    expect(_passivizeOutlet(COMPILED_LAYOUT)).toContain(
      `const createOutletBoundary = () => branch('div', { 'data-aihu-outlet': '' }, []);`,
    )
    expect(_passivizeOutlet(COMPILED_LAYOUT)).not.toContain('onMount(')
    // No `<outlet>` in the layout → untouched.
    expect(_passivizeOutlet(COMPILED_STATIC)).toBe(COMPILED_STATIC)
    // Head present but never terminated → untouched, as before.
    const truncated = `const createOutletBoundary = () => {\n  const host = 1;\n`
    expect(_passivizeOutlet(truncated)).toBe(truncated)
  })

  it('_foldCssEngineStyles swaps the replaceSync body exactly as the old regex did', () => {
    const old = (code: string, escaped: string) => {
      // biome-ignore lint/correctness/noEmptyCharacterClassInRegex: [^] matches any char incl. newlines
      const re = /(__style__\.replaceSync\(`)[^]*?(`\);)/
      return re.test(code)
        ? code.replace(re, (_m, open: string, close: string) => `${open}${escaped}${close}`)
        : null
    }
    for (const s of CORPUS) {
      const expected = old(s, '.u{color:blue}')
      if (expected === null) continue
      expect(_foldCssEngineStyles(s, '.u{color:blue}')).toBe(expected)
    }
    const out = _foldCssEngineStyles(COMPILED_WITH_STYLE, '.u{color:blue}')
    expect(out).toContain('__style__.replaceSync(`.u{color:blue}`);')
    expect(out).not.toContain('p { color: red }\n.a { --x: 1 }')
    // Empty body round-trips.
    const emptyBody = '__style__.replaceSync(``);\n'
    expect(_foldCssEngineStyles(emptyBody, '.u{}')).toBe('__style__.replaceSync(`.u{}`);\n')
    // A `$&` in the CSS must land literally, not as a replacement pattern.
    expect(_foldCssEngineStyles(emptyBody, '.u{content:"$&$1"}')).toBe(
      '__style__.replaceSync(`.u{content:"$&$1"}`);\n',
    )
  })

  it('_foldSsrCssExport swaps the __aihu_css__ body exactly as the old regex did', () => {
    const old = (code: string, escaped: string) => {
      // biome-ignore lint/correctness/noEmptyCharacterClassInRegex: [^] matches any char incl. newlines
      const re = /(export const __aihu_css__ = `)[^]*?(`)/
      return re.test(code)
        ? code.replace(re, (_m, open: string, close: string) => `${open}${escaped}${close}`)
        : null
    }
    for (const s of CORPUS) {
      const expected = old(s, '.u{color:blue}')
      if (expected === null) continue
      expect(_foldSsrCssExport(s, '.u{color:blue}')).toBe(expected)
    }
    expect(_foldSsrCssExport(COMPILED_WITH_STYLE, '.u{color:blue}')).toContain(
      'export const __aihu_css__ = `.u{color:blue}`',
    )
    // No existing export → shape 2 appends one.
    expect(_foldSsrCssExport(COMPILED_STATIC, '.u{}')).toContain(
      'export const __aihu_css__ = `.u{}`',
    )
  })

  it('the base-recipe probe answers exactly as the old regex did', async () => {
    // biome-ignore lint/correctness/noEmptyCharacterClassInRegex: [^] matches any char incl. newlines
    const old = (code: string) => /defineComponent\(\s*\{[^]*?\bbase\s*:/.test(code)
    // `_hasBaseRecipe` is module-private; exercise the same predicate here and
    // pin it against the shapes the plugin classifies on.
    const nu = (code: string): boolean => {
      const head = /defineComponent\(\s*\{/.exec(code)
      if (head === null) return false
      const key = /\bbase\s*:/g
      key.lastIndex = head.index + head[0].length
      return key.test(code)
    }
    const cases = [
      ...CORPUS,
      "defineElement('x', defineComponent({ base: HTMLElement, setup: () => {} }))",
      "defineElement('x', defineComponent({\n  base: Foo,\n}))",
      "defineElement('x', defineComponent({ setup: () => {}, base : Foo }))",
      "defineElement('x', defineComponent({ props: {} }))",
      "defineElement('x', defineComponent((_ctx) => { const base: number = 1 }))",
      'defineComponent({ a: 1 })\ndefineComponent({ base: X })',
      'const database: 1 = 1; defineComponent({ x: 1 })',
      'defineComponent(  {  base:X })',
    ]
    for (const s of cases) expect(nu(s), `subject: ${JSON.stringify(s)}`).toBe(old(s))
    expect(nu('defineComponent({ base: HTMLElement })')).toBe(true)
    // `database:` must not count — `\b` still guards the key.
    expect(nu('defineComponent({ x: 1 })\nconst database: 1 = 1')).toBe(false)
  })
})

describe('behaviour preservation — the exported rewriters end to end', () => {
  it('_injectAutoWiring is unchanged across every import shape', () => {
    for (const s of CORPUS) {
      const out = _injectAutoWiring(s)
      expect(typeof out).toBe('string')
    }
    // Value import present → `signal` appended, not duplicated.
    expect(_injectAutoWiring(COMPILED_INTERACTIVE)).toContain(
      "import { signal } from '@aihu/signals'",
    )
    expect(_injectAutoWiring(COMPILED_INTERACTIVE).match(/from '@aihu\/signals'/g)).toHaveLength(1)
    // Type-only import → a value import is inserted after it.
    const typed = _injectAutoWiring(COMPILED_TYPE_ONLY_SIGNALS)
    expect(typed).toContain("import type { Signal } from '@aihu/signals'")
    expect(typed).toContain("import { signal } from '@aihu/signals'")
    // No signals import at all → one is created after the arbor import.
    const none = _injectAutoWiring(COMPILED_STATIC)
    expect(none.match(/from '@aihu\/signals'/g)).toHaveLength(1)
    expect(none).toContain("import { branch, leaf, slot, mount } from '@aihu/arbor'")
    expect(none).toContain('_setMount(mount)')
    expect(none).toContain('_setSignal(signal)')
    expect(none).toContain(
      "import { defineComponent, defineElement, _setMount, _setSignal } from '@aihu/runtime'",
    )
    // Multi-line import lists survive the narrowed character class.
    expect(_injectAutoWiring(COMPILED_MULTILINE_IMPORT)).toContain(
      "import { branch, leaf, slot, mount } from '@aihu/arbor'",
    )
  })

  it('_buildStaticIsland still strips the runtime import and adds arbor mount', () => {
    const out = _buildStaticIsland(COMPILED_STATIC, 'x-msg')
    expect(out).not.toMatch(/from\s*'@aihu\/runtime'/)
    expect(out).toContain("import { branch, leaf, slot, mount } from '@aihu/arbor'")
    expect(out).toContain('customElements.define("x-msg"')
    // Indented / semicolon-terminated runtime imports are still stripped.
    for (const line of [
      "  import { defineComponent, defineElement } from '@aihu/runtime'",
      "import { defineComponent, defineElement } from '@aihu/runtime';",
      "import{defineComponent,defineElement}from'@aihu/runtime'",
    ]) {
      const variant = COMPILED_STATIC.replace(
        "import { defineComponent, defineElement } from '@aihu/runtime'",
        line,
      )
      expect(_buildStaticIsland(variant, 'x-msg')).not.toMatch(/from\s*'@aihu\/runtime'/)
    }
  })

  it('_buildDeferredHydration still extends the runtime import', () => {
    const out = _buildDeferredHydration(COMPILED_INTERACTIVE, 'x-counter')
    expect(out).toContain(
      "import { defineComponent, defineElement, _hydrateOnVisible } from '@aihu/runtime'",
    )
  })
})

/**
 * Source-level backstop. Two of the rewritten patterns (`_buildHmrCode`'s
 * runtime matcher and the plugin's base-recipe probe) are only reachable
 * through the Vite `transform` hook, which needs the Rust binary — no
 * JS-only test can drive them. So assert the vulnerable SHAPE is gone from the
 * file outright: `\{[^}]*\}` is the specifier-list class that made every one
 * of these O(n²), and there is no legitimate reason for it to come back.
 */
describe('no rewritten pattern regresses in the source itself', () => {
  const SOURCE = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../js/index.ts'),
    'utf8',
  )

  it('js/index.ts contains no `{[^}]*}` specifier-list matcher', () => {
    const offenders = SOURCE.split('\n')
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => line.includes('\\{[^}]*\\}') || line.includes('\\{([^}]*)\\}'))
      .filter(([, line]) => !line.trimStart().startsWith('*'))
    expect(offenders).toEqual([])
  })

  it('js/index.ts contains no lazy any-char scan after a literal head', () => {
    const offenders = SOURCE.split('\n')
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => line.includes('[^]*?') || line.includes('[\\s\\S]*?'))
      .filter(([, line]) => !line.trimStart().startsWith('*'))
    expect(offenders).toEqual([])
  })
})

// ── The fix: adversarial inputs must not blow up ────────────────────────────
//
// Every pump below is the string CodeQL named in the alert. Against the
// ORIGINAL patterns these run 0.8 s – 4.7 s at n = 32 000 and grow 4x for each
// doubling; the budget is deliberately far below that, so a regression to a
// re-scanning shape fails loudly rather than merely getting slower.

const PUMP_N = 32_000
const BUDGET_MS = 250

function elapsed(fn: () => unknown): number {
  const t0 = performance.now()
  fn()
  return performance.now() - t0
}

describe('redos — the shipped rewriters stay linear on adversarial input', () => {
  // Driven through the EXPORTED functions, not through test-local copies of the
  // patterns: this half has to fail if `js/index.ts` ever regresses, and a
  // pattern pair declared in this file cannot notice that.
  const cases: [string, () => unknown][] = [
    [
      '_buildDeferredHydration — runtime named import',
      () => _buildDeferredHydration('import {\n'.repeat(PUMP_N), 'x-a'),
    ],
    [
      '_buildStaticIsland — runtime import line + arbor named import',
      () =>
        _buildStaticIsland(
          `defineElement('x-a', defineComponent(\n${'import {\n'.repeat(PUMP_N)}`,
          'x-a',
        ),
    ],
    [
      // Trailing arbor import, so step 1 takes the REPLACE path and both the
      // capturing and non-capturing arbor matchers scan the pump.
      '_injectAutoWiring — arbor + signals-value + runtime named imports',
      () =>
        _injectAutoWiring(`${'import {\n'.repeat(PUMP_N)}import { branch } from '@aihu/arbor'\n`),
    ],
    [
      // Leading real type-import so `anySignals` is true and control reaches
      // the `import type` branch with the pump still ahead of it.
      '_injectAutoWiring — signals type import',
      () =>
        _injectAutoWiring(
          `import type { Signal } from '@aihu/signals'\n${'import type {\n'.repeat(PUMP_N)}`,
        ),
    ],
    [
      // Leading real value-import so control reaches the capturing signals
      // matcher, with the pump between it and the end of the module.
      '_injectAutoWiring — signals capturing matcher',
      () =>
        _injectAutoWiring(`import { signal } from '@aihu/signals'\n${'import {\n'.repeat(PUMP_N)}`),
    ],
    [
      '_injectAutoWiring — the any-signals probe (single long line)',
      () => _injectAutoWiring('import'.repeat(PUMP_N)),
    ],
    [
      '_passivizeOutlet — repeated boundary head',
      () => _passivizeOutlet('const createOutletBoundary = () => {'.repeat(PUMP_N)),
    ],
    [
      '_foldCssEngineStyles — repeated replaceSync head',
      () => _foldCssEngineStyles('__style__.replaceSync(`'.repeat(PUMP_N), '.u{}'),
    ],
    [
      '_foldSsrCssExport — repeated __aihu_css__ head',
      () => _foldSsrCssExport('export const __aihu_css__ = `'.repeat(PUMP_N), '.u{}'),
    ],
  ]

  for (const [name, run] of cases) {
    it(`${name}: completes well inside ${BUDGET_MS}ms`, () => {
      expect(elapsed(run)).toBeLessThan(BUDGET_MS)
    })
  }

  // The two patterns with no exported entry point: `_hasBaseRecipe` is reached
  // only from the Vite `transform` hook (which needs the Rust binary), and the
  // whitespace-tail pump needs a subject the strip-the-import-line matcher
  // actually reaches. Asserted against the shipped pattern shapes.
  it('the runtime import line survives a whitespace-tail pump', () => {
    const subject = `import{}from'@aihu/runtime'${' '.repeat(PUMP_N)}x`
    expect(elapsed(() => NEW.runtimeLine.test(subject))).toBeLessThan(BUDGET_MS)
  })

  it('the base-recipe probe stays linear on repeated defineComponent({', () => {
    const nu = (code: string): boolean => {
      const head = /defineComponent\(\s*\{/.exec(code)
      if (head === null) return false
      const key = /\bbase\s*:/g
      key.lastIndex = head.index + head[0].length
      return key.test(code)
    }
    expect(elapsed(() => nu('defineComponent({'.repeat(PUMP_N)))).toBeLessThan(BUDGET_MS)
  })
})
