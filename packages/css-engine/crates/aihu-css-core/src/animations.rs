//! Ported animation catalog — transcribed from
//! `vendor/tailwind-animations-<SHA>/index.css` (MIT, © Miguel Ángel Durán).
//! See `docs/plans/2026-08-01-tailwind-animations-port.md` §2 for why these
//! live in the utility engine rather than the recipe channel (D-A: recipes
//! silently drop top-level `@keyframes` and have no variant support today).
//!
//! This is Slice 1 of the roadmap in that doc — an 8-animation, 4-cluster
//! proof batch. Later slices append more entries; the table MUST stay sorted
//! by `class` so parallel slices don't conflict when inserting.

use std::collections::BTreeSet;

/// One ported animation: its utility class, the `animation:` shorthand it
/// resolves to, and the `@keyframes` block the shorthand depends on.
pub struct Animation {
    pub class: &'static str,
    pub shorthand: &'static str,
    pub keyframes: &'static str,
}

/// MUST stay sorted by `class` — `lookup` binary-searches, and sortedness
/// keeps append-only parallel slices conflict-free (see the port doc §8).
pub static ANIMATIONS: &[Animation] = &[
    Animation {
        class: "animate-blurred-fade-in",
        shorthand: "blurred-fade-in 0.9s ease-in-out both",
        keyframes: "@keyframes blurred-fade-in { 0% { filter: blur(5px); opacity: 0; } 100% { filter: blur(0); opacity: 1; } }",
    },
    Animation {
        class: "animate-fade-in",
        shorthand: "fade-in 0.6s ease-in both",
        keyframes: "@keyframes fade-in { 0% { opacity: 0; } 100% { opacity: 1; } }",
    },
    Animation {
        class: "animate-fade-in-down",
        shorthand: "fade-in-down 0.6s ease-in-out both",
        keyframes: "@keyframes fade-in-down { 0% { opacity: 0; transform: translateY(-20px); } 100% { opacity: 1; transform: translateY(0); } }",
    },
    Animation {
        class: "animate-fade-in-left",
        shorthand: "fade-in-left 0.6s ease-in-out both",
        keyframes: "@keyframes fade-in-left { 0% { opacity: 0; transform: translateX(20px); } 100% { opacity: 1; transform: translateX(0); } }",
    },
    Animation {
        class: "animate-fade-in-right",
        shorthand: "fade-in-right 0.6s ease-in-out both",
        keyframes: "@keyframes fade-in-right { 0% { opacity: 0; transform: translateX(-20px); } 100% { opacity: 1; transform: translateX(0); } }",
    },
    Animation {
        class: "animate-fade-in-up",
        shorthand: "fade-in-up 0.6s ease-in-out both",
        keyframes: "@keyframes fade-in-up { 0% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }",
    },
    Animation {
        class: "animate-fade-out",
        shorthand: "fade-out 0.6s ease-out both",
        keyframes: "@keyframes fade-out { 0% { opacity: 1; } 100% { opacity: 0; } }",
    },
    Animation {
        class: "animate-fade-out-down",
        shorthand: "fade-out-down 0.6s ease-out both",
        keyframes: "@keyframes fade-out-down { 0% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(20px); } }",
    },
    Animation {
        class: "animate-fade-out-left",
        shorthand: "fade-out-left 0.6s ease-out both",
        keyframes: "@keyframes fade-out-left { 0% { opacity: 1; transform: translateX(0); } 100% { opacity: 0; transform: translateX(-20px); } }",
    },
    Animation {
        class: "animate-fade-out-right",
        shorthand: "fade-out-right 0.6s ease-out both",
        keyframes: "@keyframes fade-out-right { 0% { opacity: 1; transform: translateX(0); } 100% { opacity: 0; transform: translateX(20px); } }",
    },
    Animation {
        class: "animate-fade-out-up",
        shorthand: "fade-out-up 0.6s ease-out both",
        keyframes: "@keyframes fade-out-up { 0% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(-20px); } }",
    },
    Animation {
        class: "animate-jump",
        shorthand: "jump 1s ease-in-out both",
        keyframes: "@keyframes jump { 0% { transform: translateY(0); } 50% { transform: translateY(-20px); } 100% { transform: translateY(0); } }",
    },
    Animation {
        class: "animate-rotate-in",
        shorthand: "rotate-in 0.6s ease-out both",
        keyframes: "@keyframes rotate-in { 0% { opacity: 0; transform: rotate(-90deg); } 100% { opacity: 1; transform: rotate(0deg); } }",
    },
    Animation {
        class: "animate-shake",
        shorthand: "shake 0.5s ease-in-out both",
        keyframes: "@keyframes shake { 0% { transform: translateX(0); } 25% { transform: translateX(-10px); } 50% { transform: translateX(10px); } 75% { transform: translateX(-10px); } 100% { transform: translateX(0); } }",
    },
    Animation {
        // `--tw-anim-slide-distance` (upstream, default `20px`) is renamed to
        // `--aihu-anim-slide-distance` per D-D — the inline `20px` fallback
        // makes this self-contained, no `theme.rs` registration needed. The
        // `animate-slide-distance-*` arbitrary-value utility that sets it is
        // registered in `tokens.rs::arbitrary_prop` (Slice 5).
        class: "animate-slide-in-bottom",
        shorthand: "slide-in-bottom 0.6s ease-out both",
        keyframes: "@keyframes slide-in-bottom { 0% { transform: translateY(var(--aihu-anim-slide-distance, 20px)); } 100% { transform: translateY(0); } }",
    },
    Animation {
        class: "animate-slide-in-left",
        shorthand: "slide-in-left 0.6s ease-out both",
        keyframes: "@keyframes slide-in-left { 0% { transform: translateX(calc(var(--aihu-anim-slide-distance, 20px) * -1)); } 100% { transform: translateX(0); } }",
    },
    Animation {
        class: "animate-slide-in-right",
        shorthand: "slide-in-right 0.6s ease-out both",
        keyframes: "@keyframes slide-in-right { 0% { transform: translateX(var(--aihu-anim-slide-distance, 20px)); } 100% { transform: translateX(0); } }",
    },
    Animation {
        class: "animate-slide-in-top",
        shorthand: "slide-in-top 0.6s ease-out both",
        keyframes: "@keyframes slide-in-top { 0% { transform: translateY(calc(var(--aihu-anim-slide-distance, 20px) * -1)); } 100% { transform: translateY(0); } }",
    },
    Animation {
        class: "animate-slide-out-bottom",
        shorthand: "slide-out-bottom 0.6s ease-out both",
        keyframes: "@keyframes slide-out-bottom { 0% { transform: translateY(0); } 100% { transform: translateY(var(--aihu-anim-slide-distance, 20px)); } }",
    },
    Animation {
        class: "animate-slide-out-left",
        shorthand: "slide-out-left 0.6s ease-out both",
        keyframes: "@keyframes slide-out-left { 0% { transform: translateX(0); } 100% { transform: translateX(calc(var(--aihu-anim-slide-distance, 20px) * -1)); } }",
    },
    Animation {
        class: "animate-slide-out-right",
        shorthand: "slide-out-right 0.6s ease-out both",
        keyframes: "@keyframes slide-out-right { 0% { transform: translateX(0); } 100% { transform: translateX(var(--aihu-anim-slide-distance, 20px)); } }",
    },
    Animation {
        class: "animate-slide-out-top",
        shorthand: "slide-out-top 0.6s ease-out both",
        keyframes: "@keyframes slide-out-top { 0% { transform: translateY(0); } 100% { transform: translateY(calc(var(--aihu-anim-slide-distance, 20px) * -1)); } }",
    },
    Animation {
        class: "animate-slide-rotate-in",
        shorthand: "slide-rotate-in 0.6s ease-out both",
        keyframes: "@keyframes slide-rotate-in { 0% { opacity: 0; transform: translateX(-20px) rotate(-90deg); } 100% { opacity: 1; transform: translateX(0) rotate(0deg); } }",
    },
    Animation {
        class: "animate-slide-rotate-out",
        shorthand: "slide-rotate-out 0.6s ease-out both",
        keyframes: "@keyframes slide-rotate-out { 0% { opacity: 1; transform: translateX(0) rotate(0deg); } 100% { opacity: 0; transform: translateX(20px) rotate(90deg); } }",
    },
    Animation {
        class: "animate-zoom-in",
        shorthand: "zoom-in 0.6s ease-out both",
        keyframes: "@keyframes zoom-in { 0% { opacity: 0; transform: scale(.5); } 100% { opacity: 1; transform: scale(1); } }",
    },
];

/// Binary-search lookup by class name. `ANIMATIONS` must stay sorted.
pub fn lookup(class: &str) -> Option<&'static Animation> {
    ANIMATIONS
        .binary_search_by_key(&class, |a| a.class)
        .ok()
        .map(|i| &ANIMATIONS[i])
}

/// The `@media (prefers-reduced-motion: reduce)` safety net (port doc §2,
/// decision D-B·a). Built from the scanned token set so it tree-shakes with
/// everything else — only classes actually used get a selector. Returns an
/// empty string when no ported animation is in use.
///
/// `1ms`, not `animation: none` — so `animationend` still fires and any JS
/// awaiting it does not hang. `:not([data-motion="always"])` is the
/// per-element escape hatch for animation that carries meaning (e.g. a
/// loading spinner).
pub fn reduced_motion_guard(classes: &BTreeSet<String>) -> String {
    let mut selectors: Vec<String> = classes
        .iter()
        .filter(|token| {
            let (_, base) = crate::variants::split_variants(token);
            lookup(&base).is_some()
        })
        .map(|token| format!("{}:not([data-motion=\"always\"])", escaped(token)))
        .collect();

    if selectors.is_empty() {
        return String::new();
    }
    selectors.sort();

    format!(
        "@media (prefers-reduced-motion: reduce) {{\n  {} {{\n    animation-duration: 1ms !important;\n    animation-iteration-count: 1 !important;\n    animation-delay: 0ms !important;\n  }}\n}}\n",
        selectors.join(",\n  ")
    )
}

fn escaped(token: &str) -> String {
    format!(".{}", crate::emit::escape_class(token))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn table_is_sorted_and_unique() {
        assert!(
            ANIMATIONS.windows(2).all(|w| w[0].class < w[1].class),
            "ANIMATIONS must stay sorted by class for lookup() and for conflict-free parallel slices"
        );
    }

    #[test]
    fn every_class_is_animate_prefixed() {
        for a in ANIMATIONS {
            assert!(a.class.starts_with("animate-"), "{}", a.class);
        }
    }

    #[test]
    fn every_shorthand_names_its_own_keyframe() {
        for a in ANIMATIONS {
            let name = &a.class["animate-".len()..];
            let first_word = a.shorthand.split_whitespace().next().unwrap();
            assert_eq!(first_word, name, "shorthand/class mismatch for {}", a.class);
            assert!(
                a.keyframes.starts_with(&format!("@keyframes {name} {{")),
                "keyframes name mismatch for {}: {}",
                a.class,
                a.keyframes
            );
        }
    }

    #[test]
    fn keyframes_parse_as_valid_css() {
        for a in ANIMATIONS {
            let sheet = crate::style_parser::parse_style(a.keyframes)
                .unwrap_or_else(|e| panic!("{} keyframes failed to parse: {e:?}", a.class));
            assert_eq!(sheet.nodes.len(), 1, "{}", a.class);
            match &sheet.nodes[0] {
                crate::style_parser::StyleNode::AtRule(at) => assert_eq!(at.name, "@keyframes"),
                other => panic!("{} did not parse as an at-rule: {other:?}", a.class),
            }
        }
    }

    #[test]
    fn lookup_finds_every_entry() {
        for a in ANIMATIONS {
            assert!(lookup(a.class).is_some(), "{}", a.class);
        }
        assert!(lookup("animate-does-not-exist").is_none());
    }

    #[test]
    fn reduced_motion_guard_empty_when_unused() {
        let classes: BTreeSet<String> = ["p-4".to_string(), "flex".to_string()].into();
        assert_eq!(reduced_motion_guard(&classes), "");
    }

    #[test]
    fn reduced_motion_guard_covers_used_and_variant_forms() {
        let classes: BTreeSet<String> =
            ["animate-shake".to_string(), "hover:animate-jump".to_string()].into();
        let guard = reduced_motion_guard(&classes);
        assert!(guard.contains("prefers-reduced-motion: reduce"));
        assert!(guard.contains(".animate-shake:not([data-motion=\"always\"])"));
        assert!(guard.contains(".hover\\:animate-jump:not([data-motion=\"always\"])"));
        assert!(guard.contains("animation-duration: 1ms !important"));
    }
}
