//! `features/` — the built-in progressive features (Plan 3 Tasks 5–8).
//!
//! Each module implements [`crate::progressive::ProgressiveFeature`] for one
//! forward-looking CSS feature. They are registered into the default
//! [`crate::progressive::ProgressiveRegistry`] via [`register_builtins`].
//!
//! | Feature           | `@supports` gate              | JS fallback        |
//! |-------------------|-------------------------------|--------------------|
//! | `view-transition:`| `view-transition-name: none`  | none (CSS-only)    |
//! | `anchor:`         | `anchor-name: --a`            | `anchorFallback`   |
//! | `popover:`        | `selector(:popover-open)`     | `popoverFallback`  |
//! | `text-balance:`   | none                          | none (CSS-only)    |

use crate::progressive::ProgressiveRegistry;

pub mod anchor;
pub mod popover;
pub mod text_balance;
pub mod view_transition;

pub use anchor::Anchor;
pub use popover::Popover;
pub use text_balance::TextBalance;
pub use view_transition::ViewTransition;

/// Register every built-in progressive feature into `registry`. Called by
/// [`ProgressiveRegistry::with_builtins`](crate::progressive::ProgressiveRegistry::with_builtins).
pub fn register_builtins(registry: &mut ProgressiveRegistry) {
    registry.register(Box::new(ViewTransition));
    registry.register(Box::new(Anchor));
    registry.register(Box::new(Popover));
    registry.register(Box::new(TextBalance));
}
