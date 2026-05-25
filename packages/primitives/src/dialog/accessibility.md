# `dialog` — accessibility (WAI-ARIA APG Dialog Modal)

Headless implementation of the WAI-ARIA APG
[Dialog (Modal)](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
pattern. Ships no CSS; every piece reflects `data-state="open"|"closed"`.

## Conformance mapping

| APG requirement | How `dialog` satisfies it |
|---|---|
| Container has `role="dialog"` (or `alertdialog`) | `dialog-content` sets `role="dialog"`; override via a `role` attribute |
| `aria-modal="true"` when modal | `dialog-content` sets it when the root's `modal` is true (default) |
| Labelled by its title | `dialog-title` generates a stable id wired into content's `aria-labelledby` |
| Described by its body | `dialog-description` generates a stable id wired into content's `aria-describedby` |
| Focus moves into the dialog on open | `createFocusTrap().activate()` focuses the first focusable (or the content) |
| Tab / Shift+Tab cycle stays within the dialog | focus-trap wraps at both edges |
| `Escape` closes the dialog | `dialog-content` keydown handler calls `close()` (suppress via `data-dismissable-escape="false"`) |
| Focus returns to the invoking element on close | focus-trap stores `document.activeElement` at open and restores it on deactivate |
| Trigger advertises the dialog | `dialog-trigger` sets `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls={contentId}` |

## Notes

- **Headless / no scroll-lock CSS:** the primitive exposes a `data-scroll-lock`
  hook attribute only; the consumer owns any scroll-lock styling.
- **Backdrop dismissal:** `dialog-backdrop` closes a modal dialog on click
  unless `data-dismissable-outside="false"`.
- Pieces coordinate through `dialogContext` (DOM-walk), so the trigger, content,
  title, description, backdrop, and close button need no explicit wiring.
