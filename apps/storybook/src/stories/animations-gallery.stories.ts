/**
 * Animations gallery — tailwind-animations port doc, Track A Slice 14
 * ("docs + demo gallery rendering all 78 [animations]... real visual
 * regression net").
 *
 * Renders one box per class in `ANIMATION_GALLERY_CLASSES`
 * (`animations-gallery.generated.ts`, derived from `animations::ANIMATIONS`
 * at generation time — `bun run gen:animations-gallery` from
 * packages/css-engine, never hand-edited). The compiled CSS
 * (`animations-gallery.generated.css`, generated alongside it) is injected
 * into the document head once, module-scope — this is plain HTML, not a
 * compiled `.aihu` SFC, so Storybook's `aihuCompilerPlugin` never sees these
 * utility classes; without the pre-generated stylesheet every box would
 * render completely unstyled.
 *
 * Every ported shorthand ends in `both` (see `animations.rs`), so each box
 * settles into its animation's final resting state ~1s after mount — a
 * static Chromatic snapshot taken after that settle window IS a real visual
 * regression net for the catalog, without needing to pin a mid-animation
 * frame. `Replay` re-triggers every animation on demand for manual QA (a
 * forced reflow between removing and re-adding the class — the same restart
 * mechanism the keyed-`<group>` trick in `rotator`/`word-roll` relies on,
 * done here with plain DOM APIs since this story has no `.aihu` template).
 *
 * NOT part of the registry payload — this isn't a registry component at all.
 */
// Vite inlines the generated stylesheet (build-time asset, not a component's
// scoped CSS) — see this file's header comment for why it must be pre-generated.
// @ts-expect-error — ?inline is a Vite asset query, invisible to tsc.
import galleryCss from './animations-gallery.generated.css?inline'
import { ANIMATION_GALLERY_CLASSES } from './animations-gallery.generated.ts'

function ensureGalleryStyleInjected(): void {
  if (document.getElementById('aihu-animations-gallery-css')) return
  const el = document.createElement('style')
  el.id = 'aihu-animations-gallery-css'
  el.textContent = galleryCss as string
  document.head.append(el)
}

function renderGallery(): string {
  ensureGalleryStyleInjected()
  const cards = ANIMATION_GALLERY_CLASSES.map(
    (cls) => `
      <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 1rem; border: 1px solid var(--color-border, #3333); border-radius: 0.5rem;">
        <div class="${cls}" style="width: 3rem; height: 3rem; border-radius: 0.375rem; background: var(--color-accent, #6366f1);"></div>
        <code style="font-size: 0.7rem; text-align: center; word-break: break-word;">${cls}</code>
      </div>`,
  ).join('')

  return `
    <div>
      <button id="aihu-gallery-replay" type="button" style="margin-bottom: 1rem; padding: 0.5rem 1rem; cursor: pointer;">
        Replay all (${ANIMATION_GALLERY_CLASSES.length})
      </button>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr)); gap: 0.75rem;">
        ${cards}
      </div>
    </div>`
}

/** Force every box's animation to restart: remove the class, force a reflow
 * (`void el.offsetWidth`), then re-add it — the same trick a browser's
 * layout engine needs to notice the animation is "new" again. */
function replayAll(root: HTMLElement): void {
  const boxes = root.querySelectorAll<HTMLElement>('[class]')
  for (const box of boxes) {
    const cls = ANIMATION_GALLERY_CLASSES.find((c) => box.classList.contains(c))
    if (!cls) continue
    box.classList.remove(cls)
    void box.offsetWidth
    box.classList.add(cls)
  }
}

export default {
  title: 'Docs/Animations gallery',
  tags: ['autodocs'],
  parameters: {
    // 78 boxes' worth of transform/opacity/filter animations is a LOT of
    // simultaneous color-contrast/motion surface for axe to walk — this
    // gallery is a visual regression net, not a component under a11y review
    // (every individual animation utility has no semantic content of its
    // own; the components that USE them carry their own a11y stories).
    // `disable: true`, not `test: 'off'` — the test-runner's own
    // `.storybook/test-runner.ts` only reads `parameters.a11y.disable`.
    a11y: { disable: true },
  },
}

export const Default = {
  render: renderGallery,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const button = canvasElement.querySelector<HTMLButtonElement>('#aihu-gallery-replay')
    button?.addEventListener('click', () => replayAll(canvasElement))
  },
}

export const DarkMode = {
  render: renderGallery,
  globals: { mode: 'dark' },
}

export const ReducedMotion = {
  render: renderGallery,
  parameters: { chromatic: { prefersReducedMotion: 'reduce' } },
}
