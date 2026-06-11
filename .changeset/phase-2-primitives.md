---
'@aihu/primitives': minor
---

Phase 2 headless primitives (spec §7.7): `Separator`, `Label`, `Input`,
`Textarea`, `Checkbox`, `Switch`, `RadioGroup`. Each is a light-DOM, zero-CSS
custom element with full WAI-ARIA APG keyboard + ARIA behavior, exported from
its own subpath (`@aihu/primitives/<name>`).

- Form participation via a visually-hidden native input (`attachHiddenInput`,
  re-exported from `@aihu/primitives/form-control`); Input/Textarea wrap a real
  native control directly. Values ride native `FormData` / submission.
- Labelling ARIA (`aria-label`/`aria-labelledby`/`aria-describedby`) on Input/
  Textarea hosts is forwarded to the native control; the form-association input
  is placed as the host's sibling to avoid `nested-interactive` on roled hosts.
- `form-control` exposes `labelId` and wires `aria-labelledby` for non-native
  (`[data-fc-label]`) labels; `roving-focus` `setCurrent(i, focus=false)` moves
  the tab stop without stealing focus (RadioGroup selection-follows-focus).
