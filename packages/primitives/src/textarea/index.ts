/**
 * `<aihu-textarea>` — headless multi-line text control. Wraps (or creates) a
 * real light-DOM `<textarea>` and delegates editing/focus/form participation
 * to it (the native-handoff principle — see `../input/text-control.ts`).
 * Ships zero CSS: the host reflects `data-state="disabled" | "readonly" |
 * "idle"` and emits `value-change` CustomEvents for the consumer.
 */

import { AihuTextControlBase, TEXT_CONTROL_OBSERVED } from '../input/text-control.ts'

const TEXTAREA_FORWARDED: readonly string[] = [
  'name',
  'placeholder',
  'rows',
  'cols',
  'minlength',
  'maxlength',
  'readonly',
  'autocomplete',
]

export class AihuTextarea extends AihuTextControlBase {
  static readonly observedAttributes = [...TEXT_CONTROL_OBSERVED, ...TEXTAREA_FORWARDED]
  protected static override readonly FORWARDED = TEXTAREA_FORWARDED

  protected override readonly nativeTag = 'textarea' as const
}

let _defined = false
/** Register `<aihu-textarea>` (idempotent; a no-op without a DOM). */
export function defineTextarea(tag = 'aihu-textarea'): void {
  // No DOM, no registry to register INTO — a documented no-op. See
  // `html-element-base.ts` §"Registration without a DOM".
  if (typeof customElements === 'undefined') return
  if (_defined || customElements.get(tag)) {
    _defined = true
    return
  }
  customElements.define(tag, AihuTextarea)
  _defined = true
}
