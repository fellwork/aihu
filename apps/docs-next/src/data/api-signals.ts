/**
 * API-reference data for @aihu/signals, curated from the real package source
 * (packages/signals/src/*.ts). In the next phase this shape is the target for
 * an automated extractor over `__package-inventory.json` + each package's
 * `.d.ts` — for the slice it is hand-mirrored from source so the page renders
 * real, accurate signatures. Summaries are plain text (no markdown) because the
 * page interpolates them directly.
 */
export interface ApiParam {
  readonly name: string
  readonly type: string
  readonly desc: string
  readonly optional?: boolean
}
export interface ApiExport {
  readonly name: string
  readonly kind: 'function' | 'type'
  readonly signature: string
  readonly summary: string
  readonly params?: readonly ApiParam[]
  readonly returns?: string
  readonly example?: string
}

export const PKG = {
  name: '@aihu/signals',
  tagline: 'Tiny reactive primitives — the reactive core of aihu.',
  blurb:
    'Small (≤ 2 kB gz) reactive primitives — the foundation layer for aihu’s arbor renderer. One read shape (the signal tuple), one underlying cell. Sync semantics, lazy computed, explicit batch. No proxies, no scheduler queue, no global tick.',
} as const

export const EXPORTS: readonly ApiExport[] = [
  {
    name: 'signal',
    kind: 'function',
    signature: 'function signal<T>(initial: T, options?: SignalOptions<T>): Signal<T>',
    summary:
      'Create a reactive cell. Returns a readonly [read, write] tuple — the single read shape the whole runtime is built on.',
    params: [
      { name: 'initial', type: 'T', desc: 'The initial value held by the cell.' },
      {
        name: 'options',
        type: 'SignalOptions<T>',
        desc: 'Optional equals comparator to suppress no-op notifications.',
        optional: true,
      },
    ],
    returns: 'Signal<T> — a readonly [Read<T>, Write<T>] tuple.',
    example:
      'import { signal, effect } from \'@aihu/signals\'\n\nconst [count, setCount] = signal(0)\neffect(() => console.log(\'count =\', count()))\nsetCount(1)             // logs "count = 1"\nsetCount((n) => n + 10) // logs "count = 11"',
  },
  {
    name: 'computed',
    kind: 'function',
    signature:
      'function computed<T>(fn: () => T, options?: ComputedOptions<T>): Read<T> & { dispose(): void }',
    summary:
      'A lazily-evaluated derived value. Recomputes only when read after a dependency changed; memoized by Object.is (or a custom equals).',
    params: [
      { name: 'fn', type: '() => T', desc: 'Pure computation over other reactive reads.' },
      {
        name: 'options',
        type: 'ComputedOptions<T>',
        desc: 'Optional equals comparator for memoization.',
        optional: true,
      },
    ],
    returns: 'Read<T> & { dispose(): void }',
    example:
      "import { signal, computed } from '@aihu/signals'\n\nconst [n, setN] = signal(2)\nconst doubled = computed(() => n() * 2)\ndoubled() // 4",
  },
  {
    name: 'effect',
    kind: 'function',
    signature: 'function effect(fn: EffectFn): Dispose',
    summary:
      'Run a side effect and re-run it whenever any signal read inside it changes. Returns a Dispose to stop tracking.',
    params: [{ name: 'fn', type: 'EffectFn', desc: 'The reactive side effect to run and track.' }],
    returns: 'Dispose — call to tear the effect down.',
    example:
      "import { signal, effect } from '@aihu/signals'\n\nconst [ok, setOk] = signal(true)\nconst stop = effect(() => document.title = ok() ? 'on' : 'off')\nstop() // stop reacting",
  },
  {
    name: 'batch',
    kind: 'function',
    signature: 'function batch<T>(fn: () => T): T',
    summary:
      'Coalesce multiple writes so dependents recompute once, after the batch commits — the explicit alternative to a global scheduler tick.',
    params: [{ name: 'fn', type: '() => T', desc: 'Work that performs several writes.' }],
    returns: 'T — the value returned by fn.',
    example:
      "import { signal, batch, effect } from '@aihu/signals'\n\nconst [a, setA] = signal(1)\nconst [b, setB] = signal(2)\neffect(() => console.log(a() + b()))\nbatch(() => { setA(10); setB(20) }) // logs once: 30",
  },
  {
    name: 'untrack',
    kind: 'function',
    signature: 'function untrack<T>(fn: () => T): T',
    summary: 'Read signals without subscribing the current effect/computed to them.',
    params: [{ name: 'fn', type: '() => T', desc: 'A read that must not create a dependency.' }],
    returns: 'T — the value returned by fn.',
  },
  {
    name: 'Signal',
    kind: 'type',
    signature: 'type Signal<T> = readonly [Read<T>, Write<T>]',
    summary: 'The tuple returned by signal — a reader and a writer over one cell.',
  },
  {
    name: 'Read',
    kind: 'type',
    signature: 'type Read<T> = () => T',
    summary: 'A tracked getter. Calling it inside an effect/computed subscribes to the cell.',
  },
  {
    name: 'Write',
    kind: 'type',
    signature:
      'type Write<T> = <U extends T>(next: (Exclude<U, AnyFn> & T) | ((prev: T) => U)) => void',
    summary: 'A setter accepting either a next value or an updater function of the previous value.',
  },
]
