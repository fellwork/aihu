# Third-party notices

This file records third-party source material referenced or transcribed into aihu.

## tailwind-animations

Portions of `packages/css-engine/crates/aihu-css-core/src/animations.rs` are transcribed
from `midudev/tailwind-animations` (https://github.com/midudev/tailwind-animations),
pinned at commit `8eb93d9`, MIT licensed, Copyright (c) 2024 Miguel Ángel Durán.

Full license text: `vendor/tailwind-animations-8eb93d9/LICENSE`

## performativeUI

The design and behavior of the components ported under `docs/plans/2026-08-01-performative-ui-port.md`
(`packages/ui/registry/{glass-card,aurora,ascii-hero,node-graph-background,floating-sparkles,
goldeneye,popover,temperature,chat-fab,waitlist-form,...}` and siblings — every `.aihu` file in that
port ends its header comment with "see NOTICES.md") are transcribed IN SPIRIT from
`vorpus/performativeUI` (https://github.com/vorpus/performativeUI), MIT licensed per its
`package.json` `license` field.

Unlike `tailwind-animations` above, there is no commit to pin and no `LICENSE` file to vendor a copy
of: the source repo carries no `LICENSE` file in its tree and no version tags at the time of this
port (per the plan doc's own header) — this entry is the notice in place of a vendored license text.

Provenance rule (binding on every component in this port, restated from the plan doc): transcribe
in spirit, never vendor. No `pui-`-prefixed class name, no source CSS text, and no React component
body is copied from the original — every ported component is aihu-native code written from a
behavioral description.
