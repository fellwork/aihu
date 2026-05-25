/**
 * `<aihu-config-provider>` — app-level config propagated via reactive DOM
 * context. The canonical signal-composition demonstrator: descendants inject
 * `configContext` and read the signals inside an `effect()` so they react to
 * config changes (e.g. a tooltip reading `dir` to flip placement). Emits NO CSS
 * — it only sets host attributes the CSS engine's variants resolve against.
 *
 * Reflected attributes: `color-scheme` (`"light" | "dark" | "system"`),
 * `density` (`"comfortable" | "compact"`), `dir` (`"ltr" | "rtl"`).
 * Owned signals: `colorScheme`, `density`, `dir`.
 * Context: provides `configContext` carrying the three signals; nearest-wins
 * for nested providers.
 * DOM: reflects `dir`, `data-density`, `data-color-scheme` onto the host so the
 * engine's `host-context-dark:` variant + density tokens resolve.
 */

import { effect, type Read, signal } from '@aihu/signals'
import { createDomContext, provideContext } from '../dom-context.ts'

export type ColorScheme = 'light' | 'dark' | 'system'
export type Density = 'comfortable' | 'compact'
export type Direction = 'ltr' | 'rtl'

export interface ConfigContextValue {
  readonly colorScheme: Read<ColorScheme>
  readonly density: Read<Density>
  readonly dir: Read<Direction>
}

export const configContext = createDomContext<ConfigContextValue>('config')

export class AihuConfigProvider extends HTMLElement {
  static readonly observedAttributes = ['color-scheme', 'density', 'dir']

  private readonly _colorScheme = signal<ColorScheme>('system')
  private readonly _density = signal<Density>('comfortable')
  private readonly _dir = signal<Direction>('ltr')

  private _disposers: Array<() => void> = []

  get colorScheme(): Read<ColorScheme> {
    return this._colorScheme[0]
  }
  get density(): Read<Density> {
    return this._density[0]
  }
  /** The direction signal. Named `dirSignal` to avoid clobbering the native
   * `HTMLElement.dir` string property (which this element still reflects). */
  get dirSignal(): Read<Direction> {
    return this._dir[0]
  }

  constructor() {
    super()
    provideContext(this, configContext, {
      colorScheme: this._colorScheme[0],
      density: this._density[0],
      dir: this._dir[0],
    })
  }

  connectedCallback(): void {
    this._syncFromAttrs()
    // Reflect config onto host attributes the CSS engine targets.
    this._disposers.push(
      effect(() => {
        this.setAttribute('data-color-scheme', this._colorScheme[0]())
        this.setAttribute('data-density', this._density[0]())
        this.setAttribute('dir', this._dir[0]())
      }),
    )
  }

  disconnectedCallback(): void {
    for (const d of this._disposers) d()
    this._disposers = []
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    switch (name) {
      case 'color-scheme':
        if (isColorScheme(value)) this._colorScheme[1](value)
        break
      case 'density':
        if (isDensity(value)) this._density[1](value)
        break
      case 'dir':
        if (value === 'ltr' || value === 'rtl') this._dir[1](value)
        break
    }
  }

  /** Imperative setters (consumers may drive config from JS, not just attrs). */
  setColorScheme(v: ColorScheme): void {
    this._colorScheme[1](v)
  }
  setDensity(v: Density): void {
    this._density[1](v)
  }
  setDir(v: Direction): void {
    this._dir[1](v)
  }

  private _syncFromAttrs(): void {
    const cs = this.getAttribute('color-scheme')
    if (isColorScheme(cs)) this._colorScheme[1](cs)
    const d = this.getAttribute('density')
    if (isDensity(d)) this._density[1](d)
    const dir = this.getAttribute('dir')
    if (dir === 'ltr' || dir === 'rtl') this._dir[1](dir)
  }
}

function isColorScheme(v: string | null): v is ColorScheme {
  return v === 'light' || v === 'dark' || v === 'system'
}
function isDensity(v: string | null): v is Density {
  return v === 'comfortable' || v === 'compact'
}

let _defined = false
/** Register `<aihu-config-provider>` (idempotent). */
export function defineConfigProvider(tag = 'aihu-config-provider'): void {
  if (_defined || customElements.get(tag)) {
    _defined = true
    return
  }
  customElements.define(tag, AihuConfigProvider)
  _defined = true
}
