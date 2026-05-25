# `config-provider` — accessibility

`<aihu-config-provider>` propagates app-level configuration
(`colorScheme` / `density` / `dir`) down the tree via reactive context. It ships
no CSS and imposes no role.

## `dir` propagation

The provider reflects its `dir` signal onto the host's `dir` attribute, so the
document's directional context is correct for assistive tech and for the CSS
engine's logical-property output. Descendant primitives (e.g. `roving-focus`,
`tooltip`) inject `configContext` and read `dir` to mirror arrow-key direction
and placement in RTL — keyboard semantics stay correct under direction changes
without each widget re-detecting direction.

`data-color-scheme` and `data-density` are reflected onto the host so the
engine's `host-context-dark:` variant and density tokens resolve; they carry no
ARIA meaning themselves. Nested providers resolve **nearest-wins** (a subtree
can override the app-level config).
