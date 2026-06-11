/**
 * `<aihu-input>` — headless single-line text control. Wraps (or creates) a
 * real light-DOM `<input>` and delegates editing/focus/form participation to
 * it (the native-handoff principle — see `text-control.ts`). Ships zero CSS:
 * the host reflects `data-state="disabled" | "readonly" | "idle"` and emits
 * `value-change` CustomEvents for the consumer.
 */

import { AihuTextControlBase, TEXT_CONTROL_OBSERVED } from './text-control.ts'

const INPUT_FORWARDED: readonly string[] = [
  'type',
  'name',
  'placeholder',
  'autocomplete',
  'inputmode',
  'pattern',
  'min',
  'max',
  'step',
  'minlength',
  'maxlength',
  'readonly',
]

export class AihuInput extends AihuTextControlBase {
  static readonly observedAttributes = [...TEXT_CONTROL_OBSERVED, ...INPUT_FORWARDED]
  protected static override readonly FORWARDED = INPUT_FORWARDED

  protected override readonly nativeTag = 'input' as const
}

let _defined = false
/** Register `<aihu-input>` (idempotent). */
export function defineInput(tag = 'aihu-input'): void {
  if (_defined || customElements.get(tag)) {
    _defined = true
    return
  }
  customElements.define(tag, AihuInput)
  _defined = true
}

export { AihuTextControlBase } from './text-control.ts'
