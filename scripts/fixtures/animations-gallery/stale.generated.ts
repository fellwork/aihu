// FIXTURE — deliberately-stale animations-gallery class list, for
// check-gate-wiring.ts's negative-fixture proof of check:animations-gallery
// (C-FEL-428). NOT the real generated target; gen-animations-gallery.ts
// --check is pointed here via ANIMATIONS_GALLERY_CLASSES_TARGET so its red
// path (this file mismatching the freshly-dumped catalog) is actually
// executed and observed, without touching the real committed output.

export const ANIMATION_GALLERY_CLASSES: readonly string[] = ['gate-wiring-fixture-only']
