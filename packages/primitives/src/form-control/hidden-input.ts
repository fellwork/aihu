/**
 * `attachHiddenInput` — form-association substrate for custom form controls
 * (checkbox/switch/radio hosts). Mirrors a host's reactive state onto a
 * visually-hidden native `<input>` in the host's LIGHT DOM so the value rides
 * native `FormData` / form submission with zero re-implementation.
 *
 * The input only exists while BOTH conditions hold: the host is inside a
 * `<form>` (composed-tree `closest('form')` — crosses shadow boundaries so an
 * intervening shadow-DOM'd wrapper doesn't hide the form) AND `name()` is
 * non-null. When `name()`
 * becomes null the input is removed (reactively, inside the effect). The
 * inline visually-hidden styles are behavioral plumbing on a functional
 * element, not appearance — they do not violate the zero-CSS contract.
 *
 * The input is inserted as the host's NEXT SIBLING, not a child: hosts like
 * checkbox/switch carry an interactive ARIA role (`role="checkbox"` etc.), and
 * a nested native form control would be an `aria-hidden`-not-withstanding
 * `nested-interactive` violation. Sibling placement keeps it in the same form
 * (so `FormData` is unchanged) while staying out of the host's subtree. When
 * the host has no parent yet (pre-insertion), it falls back to a child.
 */

import { effect, type Read } from '@aihu/signals'
import { composedClosest } from '../composed-tree.ts'

export interface HiddenInputOptions {
  type: 'checkbox' | 'radio'
  name: Read<string | null>
  value: Read<string>
  checked: Read<boolean>
  required: Read<boolean>
  disabled: Read<boolean>
}

/**
 * Attach a visually-hidden native input to `host`, kept in sync with the
 * provided signals by a single effect. Returns a disposer that stops the
 * effect and removes the input.
 */
export function attachHiddenInput(host: HTMLElement, opts: HiddenInputOptions): () => void {
  let input: HTMLInputElement | null = null

  const remove = (): void => {
    input?.remove()
    input = null
  }

  const stop = effect(() => {
    // Read every signal unconditionally so the effect re-runs on any change
    // (including `name` flipping back from null).
    const name = opts.name()
    const value = opts.value()
    const checked = opts.checked()
    const required = opts.required()
    const disabled = opts.disabled()

    if (name === null || composedClosest(host, 'form') === null) {
      remove()
      return
    }

    if (input === null) {
      input = document.createElement('input')
      input.type = opts.type
      input.setAttribute('aria-hidden', 'true')
      input.setAttribute('tabindex', '-1')
      // Visually hidden, but still form-associated. Behavior, not appearance.
      input.style.position = 'absolute'
      input.style.opacity = '0'
      input.style.pointerEvents = 'none'
      input.style.margin = '0'
      input.style.transform = 'translateX(-100%)'
      // Sibling-after-host (see header): avoids nested-interactive on roled
      // hosts. Fall back to a child if the host isn't inserted yet.
      if (host.parentNode !== null) host.after(input)
      else host.appendChild(input)
    }
    input.name = name
    input.value = value
    input.checked = checked
    input.required = required
    input.disabled = disabled
  })

  return () => {
    stop()
    remove()
  }
}
