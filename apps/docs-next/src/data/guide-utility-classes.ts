/**
 * Utility Classes guide body. Adapted from the real
 * apps/docs/src/content/docs/guides/utility-classes.md. This guide is an
 * index of compiled CSS-engine output, not `.aihu` dialect — none of the
 * retired `$prop:`/`$action:`/`$resource:` collection-form macros appear
 * here, so almost all content carries over unchanged. Two corrections made
 * after spot-checking packages/css-engine/crates/aihu-css-core/src against
 * the doc:
 *
 * 1. Brand tokens: the doc says "(16)". Current source
 *    (crates/aihu-css-core/src/tokens.rs) defines 24 — the original 16
 *    core tokens PLUS 8 semantic-state tokens added since (info, success,
 *    warning, neutral, each with a `-foreground` pair). Updated below.
 * 2. `animate-*`: the doc lists 5 animations (none/spin/ping/pulse/bounce).
 *    Current source (animations.rs) defines roughly 78 — fade/slide/flip/
 *    rotate/zoom variants, jelly, tada, heartbeat, blink, and more. The
 *    original 5 are kept (still accurate, still the most common ones) with
 *    a note that the family has grown well past this list.
 *
 * Everything else (container queries, aria-/data-* variants, ring/divide/
 * motion utilities, the 22-family × 11-shade palette) was spot-checked and
 * carries over as-is. Fenced code uses the ~~~ delimiter and inline code
 * uses <code> tags so the source carries no backticks.
 */
export const UTILITY_CLASSES = `# Utility Classes

> Aihu's css-engine ships a focused Tailwind-v4 utility subset compiled at build time into per-component scoped CSS. This page is the authoritative index of every supported class, every variant, every brand token, and a "Not yet supported" callout so you know when to drop to arbitrary values or open an issue.

## At a glance

- Compiled by <code>@aihu/css-engine</code> from <code>.aihu</code> SFCs.
- Output is scoped CSS (shadow DOM by default, light DOM via <code>shadowMode: 'light'</code>).
- Unknown classes are silently dropped — there is no "JIT" and no global utility sheet.
- Conflict resolution (<code>cn()</code>) is last-wins per property group.

## Class index by family

### Layout (display, position, overflow)

| Class | Declaration |
|-------|-------------|
| <code>block</code> / <code>inline-block</code> / <code>inline</code> | <code>display: block / inline-block / inline;</code> |
| <code>flex</code> / <code>inline-flex</code> | <code>display: flex / inline-flex;</code> |
| <code>grid</code> / <code>inline-grid</code> | <code>display: grid / inline-grid;</code> |
| <code>hidden</code> | <code>display: none;</code> |
| <code>static</code> / <code>relative</code> / <code>absolute</code> / <code>fixed</code> / <code>sticky</code> | <code>position: …;</code> |
| <code>overflow-auto</code> / <code>-hidden</code> / <code>-scroll</code> / <code>-visible</code> | <code>overflow: …;</code> |

### Flex & Grid alignment

| Class | Declaration |
|-------|-------------|
| <code>flex-row</code> / <code>flex-col</code> | <code>flex-direction: row / column;</code> |
| <code>flex-wrap</code> / <code>flex-nowrap</code> | <code>flex-wrap: …;</code> |
| <code>items-start</code> / <code>-center</code> / <code>-end</code> / <code>-stretch</code> | <code>align-items: …;</code> |
| <code>justify-start</code> / <code>-center</code> / <code>-between</code> / <code>-around</code> / <code>-end</code> | <code>justify-content: …;</code> |

### Grid templating

| Class | Declaration |
|-------|-------------|
| <code>grid-cols-N</code> | <code>grid-template-columns: repeat(N, minmax(0, 1fr));</code> |
| <code>grid-cols-none</code> | <code>grid-template-columns: none;</code> |
| <code>grid-rows-N</code> | <code>grid-template-rows: repeat(N, minmax(0, 1fr));</code> |
| <code>grid-rows-none</code> | <code>grid-template-rows: none;</code> |
| <code>col-span-N</code> | <code>grid-column: span N / span N;</code> |
| <code>col-span-full</code> | <code>grid-column: 1 / -1;</code> |
| <code>col-auto</code> | <code>grid-column: auto;</code> |
| <code>row-span-N</code> | <code>grid-row: span N / span N;</code> |
| <code>row-span-full</code> | <code>grid-row: 1 / -1;</code> |
| <code>row-auto</code> | <code>grid-row: auto;</code> |

<code>N</code> is any positive integer.

### Spacing (padding, margin, gap, space-x/y)

Spacing uses the Tailwind scale: each unit is <code>0.25rem</code> (so <code>p-4</code> → <code>1rem</code>), plus <code>px</code> → <code>1px</code> and <code>0</code> → <code>0</code>.

| Class | Declaration |
|-------|-------------|
| <code>p-*</code> / <code>px-*</code> / <code>py-*</code> / <code>pt-* pr-* pb-* pl-*</code> | <code>padding…: &lt;scale&gt;;</code> |
| <code>m-*</code> / <code>mx-*</code> / <code>my-*</code> / <code>mt-* mr-* mb-* ml-*</code> | <code>margin…: &lt;scale&gt;;</code> |
| <code>mx-auto</code> / <code>my-auto</code> / <code>mt-auto</code> … | <code>margin-inline / margin-block / margin-top: auto;</code> |
| <code>gap-*</code> / <code>gap-x-*</code> / <code>gap-y-*</code> | <code>gap…: &lt;scale&gt;;</code> |
| <code>space-x-N</code> | <code>& > * + * { margin-inline-start: &lt;scale&gt;; }</code> |
| <code>space-y-N</code> | <code>& > * + * { margin-block-start: &lt;scale&gt;; }</code> |

<code>space-x/y-*</code> emit Tailwind's standard sibling-margin recipe as a nested rule (no margin on the first child; the gap lands on every following sibling).

### Position scale (top/right/bottom/left/inset)

Inset utilities use the same Tailwind spacing scale as padding/margin (each unit <code>0.25rem</code>, <code>0</code> → <code>0</code>), plus the <code>auto</code> keyword. Prefix the class with <code>-</code> for negative offsets (<code>-top-4</code> → <code>top: -1rem;</code>). <code>inset-*</code> sets all four sides; <code>inset-x-*</code> / <code>inset-y-*</code> set the logical inline / block pairs.

| Class | Declaration |
|-------|-------------|
| <code>top-N</code> / <code>right-N</code> / <code>bottom-N</code> / <code>left-N</code> | <code>top / right / bottom / left: &lt;scale&gt;;</code> |
| <code>top-auto</code> / <code>right-auto</code> … | <code>top: auto;</code> etc. |
| <code>-top-N</code> / <code>-left-N</code> … (negative) | <code>top: -&lt;scale&gt;;</code> etc. |
| <code>inset-N</code> | <code>inset: &lt;scale&gt;;</code> |
| <code>inset-0</code> | <code>inset: 0;</code> |
| <code>inset-x-N</code> | <code>inset-inline: &lt;scale&gt;;</code> |
| <code>inset-y-N</code> | <code>inset-block: &lt;scale&gt;;</code> |

<code>N</code> is any spacing-scale step (e.g. <code>0</code>, <code>2</code>, <code>4</code>, <code>0.5</code>). Arbitrary values still work for one-offs: <code>top-[3px]</code>, <code>inset-[10%]</code>.

### Sizing (width, height, min/max)

| Class | Declaration |
|-------|-------------|
| <code>w-*</code> / <code>h-*</code> (scale + fractions) | <code>width / height: …;</code> |
| <code>w-full</code> / <code>w-screen</code> / <code>w-auto</code> | <code>width: 100% / 100vw / auto;</code> |
| <code>h-full</code> / <code>h-screen</code> / <code>h-auto</code> | <code>height: 100% / 100vh / auto;</code> |
| <code>min-w-*</code> / <code>max-w-*</code> / <code>min-h-*</code> / <code>max-h-*</code> | min/max sizing |
| <code>max-w-{xs…7xl}</code> | named scale: <code>20rem … 80rem</code> |
| <code>max-w-prose</code> | <code>max-width: 65ch;</code> |
| <code>max-w-screen-{sm…2xl}</code> | breakpoint widths (<code>40rem … 96rem</code>) |
| <code>max-w-{none,full,min,max,fit}</code> | keyword max-widths |

Named <code>max-w-*</code> scale: <code>xs</code> 20rem, <code>sm</code> 24rem, <code>md</code> 28rem, <code>lg</code> 32rem, <code>xl</code> 36rem, <code>2xl</code> 42rem, <code>3xl</code> 48rem, <code>4xl</code> 56rem, <code>5xl</code> 64rem, <code>6xl</code> 72rem, <code>7xl</code> 80rem.

### Typography

| Class | Declaration |
|-------|-------------|
| <code>text-{xs…3xl}</code> | <code>font-size</code> + <code>line-height</code> |
| <code>text-left</code> / <code>-center</code> / <code>-right</code> | <code>text-align: …;</code> |
| <code>font-{thin…black}</code> | <code>font-weight: …;</code> |
| <code>italic</code> / <code>not-italic</code> | <code>font-style: …;</code> |
| <code>underline</code> / <code>line-through</code> / <code>no-underline</code> | <code>text-decoration-line: …;</code> |
| <code>uppercase</code> / <code>lowercase</code> / <code>capitalize</code> | <code>text-transform: …;</code> |
| <code>truncate</code> | ellipsis overflow recipe |

#### Leading & tracking scale

Named line-height (<code>leading-*</code>) and letter-spacing (<code>tracking-*</code>) scales, matching the Tailwind v4 defaults. <code>leading-&lt;n&gt;</code> (numeric) maps to the spacing scale (<code>leading-6</code> → <code>1.5rem</code>); the named steps are unitless multipliers. Arbitrary values still work: <code>leading-[1.4]</code>, <code>tracking-[.2em]</code>.

| Class | Declaration |
|-------|-------------|
| <code>leading-none</code> | <code>line-height: 1;</code> |
| <code>leading-tight</code> | <code>line-height: 1.25;</code> |
| <code>leading-snug</code> | <code>line-height: 1.375;</code> |
| <code>leading-normal</code> | <code>line-height: 1.5;</code> |
| <code>leading-relaxed</code> | <code>line-height: 1.625;</code> |
| <code>leading-loose</code> | <code>line-height: 2;</code> |
| <code>leading-N</code> | <code>line-height: &lt;spacing-scale&gt;;</code> |
| <code>tracking-tighter</code> | <code>letter-spacing: -0.05em;</code> |
| <code>tracking-tight</code> | <code>letter-spacing: -0.025em;</code> |
| <code>tracking-normal</code> | <code>letter-spacing: 0em;</code> |
| <code>tracking-wide</code> | <code>letter-spacing: 0.025em;</code> |
| <code>tracking-wider</code> | <code>letter-spacing: 0.05em;</code> |
| <code>tracking-widest</code> | <code>letter-spacing: 0.1em;</code> |

### Colors (bg, text, border, fill, stroke, ring, outline)

<code>bg-*</code>, <code>text-*</code>, <code>border-*</code>, <code>fill-*</code>, <code>stroke-*</code> accept both <b>brand tokens</b> (see below) and the <b>palette</b> (<code>bg-red-500</code>, <code>text-slate-700</code>, <code>bg-white</code>). Brand-token classes emit <code>var(--color-*)</code>.

### Borders (width incl. directional, radius, color)

| Class | Declaration |
|-------|-------------|
| <code>border</code> | <code>border-width: 1px;</code> |
| <code>border-{0,2,4,8}</code> | <code>border-width: 0 / 2px / 4px / 8px;</code> |
| <code>border-x-{0,2,4,8}</code> / <code>border-y-{…}</code> | <code>border-inline-width</code> / <code>border-block-width</code> |
| <code>border-t/r/b/l-{0,2,4,8}</code> | <code>border-top/right/bottom/left-width</code> |
| <code>rounded</code> / <code>-sm</code> / <code>-md</code> / <code>-lg</code> / <code>-full</code> | <code>border-radius: …;</code> |

### Divide (sibling borders)

Borders between adjacent children, reusing the same nested <code>& > * + *</code> recipe as <code>space-x/y</code>. The bare form defaults to <code>1px</code>.

| Class | Declaration |
|-------|-------------|
| <code>divide-x</code> / <code>divide-y</code> | <code>& > * + * { border-inline-width / border-block-width: 1px; }</code> |
| <code>divide-x-{0,2,4,8}</code> | <code>& > * + * { border-inline-width: 0 / 2px / 4px / 8px; }</code> |
| <code>divide-y-{0,2,4,8}</code> | <code>& > * + * { border-block-width: 0 / 2px / 4px / 8px; }</code> |
| <code>divide-x-reverse</code> / <code>divide-y-reverse</code> | <code>& > * + * { --tw-divide-{x,y}-reverse: 1; }</code> |

Set the border <i>color</i> on the same element with the standard color utilities (e.g. <code>border-muted</code>). The <code>-reverse</code> tokens keep Tailwind's API surface via the <code>--tw-divide-{x,y}-reverse</code> custom property.

### Effects

| Class | Declaration |
|-------|-------------|
| <code>shadow</code> / <code>-md</code> / <code>-lg</code> / <code>-none</code> | <code>box-shadow: …;</code> |
| <code>opacity-*</code> | <code>opacity: …;</code> |

### Ring

A focus ring drawn as a <code>box-shadow</code> composed from <code>--tw-ring-*</code> custom properties (the Tailwind v4 recipe), so the ring <b>width</b>, <b>color</b>, and <b>offset</b> are set independently and layer with a regular <code>shadow-*</code>.

| Class | Declaration |
|-------|-------------|
| <code>ring</code> | 3px ring (<code>box-shadow</code> from <code>--tw-ring-*</code>) |
| <code>ring-{0,1,2,4,8}</code> | ring at that pixel width: <code>--tw-ring-shadow: … calc({n}px + var(--tw-ring-offset-width)) var(--tw-ring-color);</code> |
| <code>ring-inset</code> | <code>--tw-ring-inset: inset;</code> (draws the ring inside the edge) |
| <code>ring-offset-{0,1,2,4,8}</code> | <code>--tw-ring-offset-width: {n}px;</code> (gap between the element and the ring) |
| <code>ring-&lt;color&gt;</code> | sets the ring <b>color</b>: <code>--tw-ring-color: var(--color-*);</code> |

The width side (<code>ring-{n}</code>) and the color side (<code>ring-&lt;color&gt;</code>) are complementary — use them together, e.g. <code>focus:ring-2 ring-blue-500</code>. The color path is unchanged; <code>ring-blue-500</code>, <code>ring-primary</code>, <code>ring-ring</code> etc. still emit <code>--tw-ring-color</code>.

### Z-index

<code>z-0</code>, <code>z-10</code>, <code>z-20</code>, <code>z-30</code>, <code>z-40</code>, <code>z-50</code>, <code>z-auto</code> → <code>z-index: …;</code>.

## Motion

Motion utilities cover transforms, transitions, and animations. Each transform utility (<code>translate-*</code>, <code>rotate-*</code>, <code>scale-*</code>) emits a <b>single <code>transform:</code> declaration</b> rather than composing CSS variables — so within one element the CSS cascade applies last-wins per family. To combine transforms (e.g. translate <i>and</i> rotate) on one element, use an arbitrary value (<code>transform-[...]</code> is not yet wired; compose with a custom <code>@style</code> rule).

### transform / translate

| Class | Declaration |
|-------|-------------|
| <code>transform</code> | identity baseline (<code>translate(0,0) rotate(0) … scaleX(1) scaleY(1)</code>) |
| <code>transform-none</code> | <code>transform: none;</code> |
| <code>translate-x-N</code> / <code>translate-y-N</code> | <code>transform: translateX/Y(&lt;spacing-scale&gt;);</code> |
| <code>-translate-x-N</code> / <code>-translate-y-N</code> | negative translate (e.g. <code>-0.5rem</code>) |

<code>translate-*</code> uses the spacing scale (<code>translate-x-2</code> → <code>0.5rem</code>). The leading <code>-</code> produces the negative form.

### rotate / scale

| Class | Declaration |
|-------|-------------|
| <code>rotate-N</code> | <code>transform: rotate(Ndeg);</code> |
| <code>-rotate-N</code> | <code>transform: rotate(-Ndeg);</code> |
| <code>scale-N</code> | <code>transform: scale(N/100);</code> (e.g. <code>scale-105</code> → <code>1.05</code>) |
| <code>scale-x-N</code> / <code>scale-y-N</code> | <code>transform: scaleX/Y(N/100);</code> |

### transition / duration / ease

| Class | Declaration |
|-------|-------------|
| <code>transition</code> | default property set + <code>150ms</code> + <code>cubic-bezier(0.4, 0, 0.2, 1)</code> |
| <code>transition-none</code> | <code>transition-property: none;</code> |
| <code>transition-all</code> | <code>transition-property: all;</code> + default timing |
| <code>transition-colors</code> | color/bg/border/decoration/fill/stroke + default timing |
| <code>transition-opacity</code> | <code>transition-property: opacity;</code> + default timing |
| <code>transition-transform</code> | <code>transition-property: transform;</code> + default timing |
| <code>duration-N</code> | <code>transition-duration: Nms;</code> |
| <code>ease-linear</code> | <code>transition-timing-function: linear;</code> |
| <code>ease-in</code> / <code>ease-out</code> / <code>ease-in-out</code> | cubic-bezier easing functions |

### animate

| Class | Declaration |
|-------|-------------|
| <code>animate-none</code> | <code>animation: none;</code> |
| <code>animate-spin</code> | <code>animation: spin 1s linear infinite;</code> + <code>@keyframes spin</code> |
| <code>animate-ping</code> | <code>animation: ping …;</code> + <code>@keyframes ping</code> |
| <code>animate-pulse</code> | <code>animation: pulse …;</code> + <code>@keyframes pulse</code> |
| <code>animate-bounce</code> | <code>animation: bounce 1s infinite;</code> + <code>@keyframes bounce</code> |

This is only the original five — the <code>animate-*</code> family has grown well past this list (fade/slide-in variants, flips, 90°/180°/360° rotations, zoom in/out, <code>jelly</code>, <code>tada</code>, <code>heartbeat</code>, <code>blink</code>, and more). Each <code>animate-*</code> (except <code>animate-none</code>) emits its <b><code>@keyframes</code> block as a top-level sibling rule</b> alongside the class rule — keyframes cannot be nested inside a selector body. Re-emitting an identical block is idempotent in CSS.

## Variants

- <b>Web-Component-native:</b> <code>host:</code>, <code>slotted:</code>, <code>slotted-&lt;tag&gt;:</code>, <code>part-&lt;name&gt;:</code>, <code>host-context-&lt;name&gt;:</code>
- <b>Pseudo:</b> <code>hover:</code>, <code>focus:</code>, <code>focus-visible:</code>, <code>active:</code>, <code>disabled:</code>, <code>visited:</code>, <code>checked:</code>
- <b>Responsive (min-width):</b> <code>sm:</code> 40rem, <code>md:</code> 48rem, <code>lg:</code> 64rem, <code>xl:</code> 80rem, <code>2xl:</code> 96rem (override via <code>@theme</code>)
- <b>Dark mode:</b> <code>dark:</code> (Firefox-safe <code>[data-theme="dark"]</code> / <code>.dark</code> cascade)
- <b>Arbitrary selectors:</b> <code>[&>li]:</code>, <code>[&:has(img)]:</code>, etc.
- <b>Stacking:</b> <code>md:hover:bg-primary</code> — left-to-right composition

### aria-*/data-* attribute variants

Gate a utility on an ARIA state or a <code>data-*</code> attribute. The variant compiles to an attribute selector appended to the class.

| Variant | Selector | Notes |
|---------|----------|-------|
| <code>aria-checked:</code> | <code>[aria-checked="true"]</code> | implicit <code>="true"</code> |
| <code>aria-disabled:</code> | <code>[aria-disabled="true"]</code> | |
| <code>aria-expanded:</code> | <code>[aria-expanded="true"]</code> | |
| <code>aria-selected:</code> | <code>[aria-selected="true"]</code> | |
| <code>aria-pressed:</code> | <code>[aria-pressed="true"]</code> | |
| <code>aria-[expanded=false]:</code> | <code>[aria-expanded="false"]</code> | arbitrary <code>name=value</code> |
| <code>data-[state=open]:</code> | <code>[data-state="open"]</code> | arbitrary <code>name=value</code> |
| <code>data-active:</code> | <code>[data-active]</code> | bare data-* → presence (no <code>="true"</code>) |

~~~
aria-expanded:bg-accent      →  .aria-expanded\\:bg-accent[aria-expanded="true"] { background-color: var(--color-accent); }
data-[state=open]:underline  →  .data-\\[state\\=open\\]\\:underline[data-state="open"] { text-decoration-line: underline; }
~~~

Any aria-/data- variant whose base utility is unknown emits nothing — there is no spurious empty rule.

### Container queries (@container)

Mark an element as a query container with <code>@container</code> (or the named <code>@container/&lt;name&gt;</code> form), then size descendants with the <code>@sm:</code>/<code>@md:</code>/<code>@lg:</code>/<code>@xl:</code>/<code>@2xl:</code> container-query variants. These wrap the rule in an <code>@container</code> at-rule rather than <code>@media</code>, and use Tailwind's container-query scale (which differs from the viewport breakpoint scale).

| Class / variant | Output |
|-----------------|--------|
| <code>@container</code> | <code>container-type: inline-size;</code> |
| <code>@container/sidebar</code> | <code>container-type: inline-size; container-name: sidebar;</code> |
| <code>@sm:</code> | <code>@container (min-width: 24rem) { … }</code> |
| <code>@md:</code> | <code>@container (min-width: 28rem) { … }</code> |
| <code>@lg:</code> | <code>@container (min-width: 32rem) { … }</code> |
| <code>@xl:</code> | <code>@container (min-width: 36rem) { … }</code> |
| <code>@2xl:</code> | <code>@container (min-width: 42rem) { … }</code> |

~~~
<div class="@container">
  <div class="@md:flex">…</div>   →  @container (min-width: 28rem) { .\\@md\\:flex { display: flex; } }
</div>
~~~

## Brand tokens (24)

Override any token in a component's <code>@style</code> block via <code>@theme { --color-primary: oklch(...); }</code>.

| Token | Token |
|-------|-------|
| <code>primary</code> / <code>primary-foreground</code> | <code>secondary</code> / <code>secondary-foreground</code> |
| <code>accent</code> / <code>accent-foreground</code> | <code>surface</code> / <code>surface-foreground</code> |
| <code>destructive</code> / <code>destructive-foreground</code> | <code>background</code> / <code>foreground</code> |
| <code>muted</code> / <code>muted-foreground</code> | <code>border</code> / <code>ring</code> |
| <code>info</code> / <code>info-foreground</code> | <code>success</code> / <code>success-foreground</code> |
| <code>warning</code> / <code>warning-foreground</code> | <code>neutral</code> / <code>neutral-foreground</code> |

The last four pairs (<code>info</code>, <code>success</code>, <code>warning</code>, <code>neutral</code>) are semantic-state tokens added after the original 16-token set — the count above (24) reflects both generations. Use as <code>bg-primary</code>, <code>text-accent</code>, <code>border-muted</code>, <code>ring-ring</code>, <code>bg-success</code>, etc.

## Palette

22 color families × 11 shades (<code>50</code>–<code>950</code>), matching the Tailwind v4 palette (e.g. <code>bg-red-500</code>, <code>text-slate-700</code>, <code>border-zinc-200</code>). Note that <code>neutral</code> is both a bare brand token (above) and a full 11-shade palette family — they're distinct code paths, so <code>bg-neutral</code> and <code>bg-neutral-500</code> resolve differently. See the <a href="https://tailwindcss.com/docs/colors">Tailwind v4 color palette</a> for the full swatch list.

## Arbitrary values

Use <code>prefix-[value]</code> to bypass the scale for: <code>bg</code>, <code>text</code>, <code>w</code>, <code>h</code>, <code>min-w</code>, <code>max-w</code>, <code>min-h</code>, <code>max-h</code>, <code>p</code>, <code>px</code>, <code>py</code>, <code>m</code>, <code>mx</code>, <code>my</code>, <code>gap</code>, <code>rounded</code>, <code>border</code>, <code>leading</code>, <code>tracking</code>, <code>z</code>, <code>top</code>, <code>right</code>, <code>bottom</code>, <code>left</code>, <code>inset</code>, <code>fill</code>, <code>stroke</code>, <code>shadow</code>.

~~~
bg-[#1a1d24]   →  background-color: #1a1d24;
w-[34ch]       →  width: 34ch;
top-[1rem]     →  top: 1rem;
~~~

## Not yet supported

> The following are deliberately out of scope today. Most have an arbitrary-value workaround; the rest require variant-parser changes. Open an issue if you need one promoted.

- Arbitrary at-rules beyond <code>@media</code> / <code>@container</code> (e.g. <code>@supports</code>)

## Worked examples

One input → output pair per notable family.

### <code>space-y-4</code> (Spacing)

~~~html
<ul class="space-y-4"> … </ul>
~~~

~~~css
.space-y-4 { & > * + * { margin-block-start: 1rem; } }
~~~

### <code>divide-y-2</code> (Divide — sibling borders)

~~~html
<ul class="divide-y-2 border-muted"> … </ul>
~~~

~~~css
.divide-y-2 { & > * + * { border-block-width: 2px; } }
~~~

### <code>mx-auto</code> (Margin auto)

~~~html
<div class="mx-auto"> … </div>
~~~

~~~css
.mx-auto { margin-inline: auto; }
~~~

### <code>max-w-7xl</code> (Named max-width)

~~~html
<section class="max-w-7xl"> … </section>
~~~

~~~css
.max-w-7xl { max-width: 80rem; }
~~~

### <code>grid-cols-3</code> (Grid templating)

~~~html
<div class="grid grid-cols-3 gap-4"> … </div>
~~~

~~~css
.grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
~~~

### <code>border-t-4</code> (Directional border width)

~~~html
<div class="border-t-4"> … </div>
~~~

~~~css
.border-t-4 { border-top-width: 4px; }
~~~

### <code>absolute top-4 right-4</code> (Position scale)

~~~html
<button class="absolute top-4 right-4"> … </button>
~~~

~~~css
.top-4 { top: 1rem; }
.right-4 { right: 1rem; }
~~~

### <code>leading-relaxed</code> (Line-height scale)

~~~html
<p class="leading-relaxed"> … </p>
~~~

~~~css
.leading-relaxed { line-height: 1.625; }
~~~

### <code>tracking-wide</code> (Letter-spacing scale)

~~~html
<h1 class="tracking-wide"> … </h1>
~~~

~~~css
.tracking-wide { letter-spacing: 0.025em; }
~~~

### <code>ring-2 ring-blue-500</code> (Ring width + color)

~~~html
<button class="focus:ring-2 ring-blue-500"> … </button>
~~~

~~~css
.ring-2 {
  --tw-ring-offset-shadow: var(--tw-ring-inset) 0 0 0 var(--tw-ring-offset-width) var(--tw-ring-offset-color);
  --tw-ring-shadow: var(--tw-ring-inset) 0 0 0 calc(2px + var(--tw-ring-offset-width)) var(--tw-ring-color);
  box-shadow: var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow, 0 0 #0000);
}
.ring-blue-500 { --tw-ring-color: var(--color-blue-500); }
~~~

### <code>ring-offset-2</code> (Ring offset width)

~~~html
<div class="ring-2 ring-offset-2"> … </div>
~~~

~~~css
.ring-offset-2 { --tw-ring-offset-width: 2px; }
~~~

### <code>hover:scale-105</code> + <code>transition-transform</code> (Motion)

~~~html
<button class="transition-transform duration-300 hover:scale-105"> … </button>
~~~

~~~css
.transition-transform { transition-property: transform; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 150ms; }
.duration-300 { transition-duration: 300ms; }
.hover\\:scale-105:hover { transform: scale(1.05); }
~~~

### <code>animate-spin</code> (Animation with hoisted keyframes)

~~~html
<div class="animate-spin"> … </div>
~~~

~~~css
.animate-spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
~~~

### <code>aria-expanded:</code> (attribute variant)

~~~html
<button class="aria-expanded:bg-accent"> … </button>
~~~

~~~css
.aria-expanded\\:bg-accent[aria-expanded="true"] { background-color: var(--color-accent); }
~~~

### <code>@container</code> + <code>@md:</code> (container query)

~~~html
<div class="@container">
  <div class="@md:flex"> … </div>
</div>
~~~

~~~css
.\\@container { container-type: inline-size; }
@container (min-width: 28rem) {
  .\\@md\\:flex { display: flex; }
}
~~~

## See also

- <a href="/guides/authoring-components">Authoring Components</a> — how <code>@style</code> composes with utility classes
- <a href="/api/css-engine">API Reference</a> — <code>@aihu/css-engine</code> export tables
`
