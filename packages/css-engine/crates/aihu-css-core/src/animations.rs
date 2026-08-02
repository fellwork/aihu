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
        class: "animate-blink",
        shorthand: "blink 0.5s both",
        keyframes: "@keyframes blink { 0% { opacity: 0; } 100% { opacity: 1; } }",
    },
    Animation {
        class: "animate-blurred-fade-in",
        shorthand: "blurred-fade-in 0.9s ease-in-out both",
        keyframes: "@keyframes blurred-fade-in { 0% { filter: blur(5px); opacity: 0; } 100% { filter: blur(0); opacity: 1; } }",
    },
    Animation {
        // Composite (Slice 10) — combines the bounce and fade-in effects
        // already ported standalone; kept distinct rather than merged into
        // either cluster because its class name and keyframe curve are
        // their own thing in the vendored catalog, not an alias.
        class: "animate-bounce-fade-in",
        shorthand: "bounce-fade-in 0.6s ease-out both",
        keyframes: "@keyframes bounce-fade-in { 0% { transform: scale(0.5); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }",
    },
    Animation {
        class: "animate-bouncing",
        shorthand: "bouncing 1s ease-in-out both",
        keyframes: "@keyframes bouncing { 0% { transform: translateY(0); } 50% { transform: translateY(-10px); } 100% { transform: translateY(0); } }",
    },
    Animation {
        class: "animate-contract-horizontally",
        shorthand: "contract-horizontally 0.6s ease-out both",
        keyframes: "@keyframes contract-horizontally { 0% { transform: scaleX(1); } 100% { transform: scaleX(0); } }",
    },
    Animation {
        class: "animate-contract-vertically",
        shorthand: "contract-vertically 0.6s ease-out both",
        keyframes: "@keyframes contract-vertically { 0% { transform: scaleY(1); } 100% { transform: scaleY(0); } }",
    },
    Animation {
        class: "animate-dancing",
        shorthand: "dancing 1s ease-in-out both",
        keyframes: "@keyframes dancing { 0% { transform: skew(0deg); } 25% { transform: skew(-40deg); } 50% { transform: skew(40deg); } 75% { transform: skew(-40deg); } 100% { transform: skew(0deg); } }",
    },
    Animation {
        class: "animate-expand-horizontally",
        shorthand: "expand-horizontally 0.6s ease-out both",
        keyframes: "@keyframes expand-horizontally { 0% { transform: scaleX(0); } 100% { transform: scaleX(1); } }",
    },
    Animation {
        class: "animate-expand-vertically",
        shorthand: "expand-vertically 0.6s ease-out both",
        keyframes: "@keyframes expand-vertically { 0% { transform: scaleY(0); } 100% { transform: scaleY(1); } }",
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
        class: "animate-flash",
        shorthand: "flash 1s ease-in-out both",
        keyframes: "@keyframes flash { 0% { opacity: 1; } 50% { opacity: 0; } 100% { opacity: 1; } }",
    },
    Animation {
        class: "animate-flip-horizontal",
        shorthand: "flip-horizontal 1s ease-in-out both",
        keyframes: "@keyframes flip-horizontal { 0% { transform: rotateY(0deg); } 100% { transform: rotateY(180deg); } }",
    },
    Animation {
        class: "animate-flip-in-x",
        shorthand: "flip-in-x 0.6s ease-out both",
        keyframes: "@keyframes flip-in-x { 0% { opacity: 0; transform: rotateY(90deg); } 100% { opacity: 1; transform: rotateY(0deg); } }",
    },
    Animation {
        class: "animate-flip-in-y",
        shorthand: "flip-in-y 0.6s ease-out both",
        keyframes: "@keyframes flip-in-y { 0% { opacity: 0; transform: rotateX(90deg); } 100% { opacity: 1; transform: rotateX(0deg); } }",
    },
    Animation {
        class: "animate-flip-out-x",
        shorthand: "flip-out-x 0.6s ease-out both",
        keyframes: "@keyframes flip-out-x { 0% { opacity: 1; transform: rotateY(0deg); } 100% { opacity: 0; transform: rotateY(90deg); } }",
    },
    Animation {
        class: "animate-flip-out-y",
        shorthand: "flip-out-y 0.6s ease-out both",
        keyframes: "@keyframes flip-out-y { 0% { opacity: 1; transform: rotateX(0deg); } 100% { opacity: 0; transform: rotateX(90deg); } }",
    },
    Animation {
        class: "animate-flip-vertical",
        shorthand: "flip-vertical 1s ease-in-out both",
        keyframes: "@keyframes flip-vertical { 0% { transform: rotateX(0deg); } 100% { transform: rotateX(180deg); } }",
    },
    Animation {
        class: "animate-flip-x",
        shorthand: "flip-x 0.6s ease-out both",
        keyframes: "@keyframes flip-x { 0% { transform: scaleX(1); } 50% { transform: scaleX(-1); } 100% { transform: scaleX(1); } }",
    },
    Animation {
        class: "animate-flip-y",
        shorthand: "flip-y 0.6s ease-out both",
        keyframes: "@keyframes flip-y { 0% { transform: scaleY(1); } 50% { transform: scaleY(-1); } 100% { transform: scaleY(1); } }",
    },
    Animation {
        class: "animate-float",
        shorthand: "float 1s ease-in-out both",
        keyframes: "@keyframes float { 0% { transform: translateY(0); } 50% { transform: translateY(-10px); } 100% { transform: translateY(0); } }",
    },
    Animation {
        class: "animate-hang",
        shorthand: "hang 1s ease-in-out both",
        keyframes: "@keyframes hang { 0% { transform: translateY(-20px); } 50% { transform: translateY(0); } 100% { transform: translateY(-20px); } }",
    },
    Animation {
        class: "animate-heartbeat",
        shorthand: "heartbeat 0.6s ease-out both",
        keyframes: "@keyframes heartbeat { 0% { transform: scale(1); } 25% { transform: scale(1.1); } 50% { transform: scale(1); } 75% { transform: scale(0.9); } 100% { transform: scale(1); } }",
    },
    Animation {
        class: "animate-horizontal-bounce",
        shorthand: "horizontal-bounce 0.6s ease-in-out both",
        keyframes: "@keyframes horizontal-bounce { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(20px); } }",
    },
    Animation {
        class: "animate-horizontal-vibration",
        shorthand: "horizontal-vibration 0.3s linear infinite both",
        keyframes: "@keyframes horizontal-vibration { 0% { transform: translateX(0); } 25% { transform: translateX(5px); } 50% { transform: translateX(-5px); } 75% { transform: translateX(5px); } 100% { transform: translateX(0); } }",
    },
    Animation {
        class: "animate-impulse-rotation-left",
        shorthand: "impulse-rotation-left 1s ease-in-out both",
        keyframes: "@keyframes impulse-rotation-left { 0% { transform: rotate(0deg); } 50% { transform: rotate(40deg); } 100% { transform: rotate(-360deg); } }",
    },
    Animation {
        class: "animate-impulse-rotation-right",
        shorthand: "impulse-rotation-right 1s ease-in-out both",
        keyframes: "@keyframes impulse-rotation-right { 0% { transform: rotate(0deg); } 50% { transform: rotate(-40deg); } 100% { transform: rotate(360deg); } }",
    },
    Animation {
        class: "animate-jelly",
        shorthand: "jelly 1s ease-out forwards",
        keyframes: "@keyframes jelly { 0% { transform: scale(1, 1); } 20% { transform: scale(1.25, 0.75); } 40% { transform: scale(0.75, 1.25); } 60% { transform: scale(1.15, 0.85); } 75% { transform: scale(0.95, 1.05); } 85% { transform: scale(1.05, 0.95); } 92% { transform: scale(1, 1.02); } 100% { transform: scale(1, 1); } }",
    },
    Animation {
        class: "animate-jiggle",
        shorthand: "jiggle 0.5s ease-in-out both",
        keyframes: "@keyframes jiggle { 0% { transform: rotate(-3deg); } 50% { transform: rotate(3deg); } 100% { transform: rotate(-3deg); } }",
    },
    Animation {
        class: "animate-jump",
        shorthand: "jump 1s ease-in-out both",
        keyframes: "@keyframes jump { 0% { transform: translateY(0); } 50% { transform: translateY(-20px); } 100% { transform: translateY(0); } }",
    },
    Animation {
        class: "animate-pop",
        shorthand: "pop 0.6s ease-out both",
        keyframes: "@keyframes pop { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }",
    },
    Animation {
        class: "animate-pulse-fade-in",
        shorthand: "pulse-fade-in 0.6s ease-out both",
        keyframes: "@keyframes pulse-fade-in { 0% { transform: scale(0.9); opacity: 0; } 50% { transform: scale(1.05); opacity: 0.5; } 100% { transform: scale(1); opacity: 1; } }",
    },
    Animation {
        class: "animate-pulsing",
        shorthand: "pulsing 1s ease-in-out both",
        keyframes: "@keyframes pulsing { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }",
    },
    Animation {
        class: "animate-roll-in",
        shorthand: "roll-in 1s ease-in-out both",
        keyframes: "@keyframes roll-in { 0% { transform: translateX(-20px) rotate(-120deg); } 100% { transform: translateX(0) rotate(0); } }",
    },
    Animation {
        class: "animate-roll-out",
        shorthand: "roll-out 1s ease-in-out both",
        keyframes: "@keyframes roll-out { 0% { transform: translateX(0) rotate(0); } 100% { transform: translateX(20px) rotate(120deg); } }",
    },
    Animation {
        class: "animate-rotate-180",
        shorthand: "rotate-180 1s ease-in-out both",
        keyframes: "@keyframes rotate-180 { 0% { transform: rotate(0deg); } 100% { transform: rotate(180deg); } }",
    },
    Animation {
        class: "animate-rotate-360",
        shorthand: "rotate-360 1s linear both",
        keyframes: "@keyframes rotate-360 { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }",
    },
    Animation {
        class: "animate-rotate-90",
        shorthand: "rotate-90 1s ease-in-out both",
        keyframes: "@keyframes rotate-90 { 0% { transform: rotate(0deg); } 100% { transform: rotate(90deg); } }",
    },
    Animation {
        class: "animate-rotate-in",
        shorthand: "rotate-in 0.6s ease-out both",
        keyframes: "@keyframes rotate-in { 0% { opacity: 0; transform: rotate(-90deg); } 100% { opacity: 1; transform: rotate(0deg); } }",
    },
    Animation {
        class: "animate-rotate-out",
        shorthand: "rotate-out 0.6s ease-out both",
        keyframes: "@keyframes rotate-out { 0% { opacity: 1; transform: rotate(0deg); } 100% { opacity: 0; transform: rotate(90deg); } }",
    },
    Animation {
        class: "animate-rotational-wave",
        shorthand: "rotational-wave 2s ease-in-out infinite both",
        keyframes: "@keyframes rotational-wave { 0% { transform: rotate(0deg); } 25% { transform: rotate(10deg); } 50% { transform: rotate(-10deg); } 75% { transform: rotate(10deg); } 100% { transform: rotate(0deg); } }",
    },
    Animation {
        class: "animate-rubber-band",
        shorthand: "rubber-band 1s ease-in-out both",
        keyframes: "@keyframes rubber-band { 0% { transform: scale(1); } 30% { transform: scale(1.25); } 40% { transform: scale(0.75); } 50% { transform: scale(1.15); } 65% { transform: scale(0.95); } 75% { transform: scale(1.05); } 100% { transform: scale(1); } }",
    },
    Animation {
        class: "animate-scale",
        shorthand: "scale 0.6s ease-out both",
        keyframes: "@keyframes scale { 0% { transform: scale(1); } 100% { transform: scale(1.10); } }",
    },
    Animation {
        class: "animate-shake",
        shorthand: "shake 0.5s ease-in-out both",
        keyframes: "@keyframes shake { 0% { transform: translateX(0); } 25% { transform: translateX(-10px); } 50% { transform: translateX(10px); } 75% { transform: translateX(-10px); } 100% { transform: translateX(0); } }",
    },
    Animation {
        class: "animate-sink",
        shorthand: "sink 1s ease-in-out both",
        keyframes: "@keyframes sink { 0% { transform: translateY(-10px); } 50% { transform: translateY(0); } 100% { transform: translateY(-10px); } }",
    },
    Animation {
        class: "animate-skew",
        shorthand: "skew 0.5s ease-in-out both",
        keyframes: "@keyframes skew { 0% { transform: skew(0deg); } 100% { transform: skew(20deg); } }",
    },
    Animation {
        class: "animate-skew-right",
        shorthand: "skew-right 0.5s ease-in-out both",
        keyframes: "@keyframes skew-right { 0% { transform: skew(0deg); } 100% { transform: skew(-20deg); } }",
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
        class: "animate-slide-up-fade",
        shorthand: "slide-up-fade 0.6s ease-out both",
        keyframes: "@keyframes slide-up-fade { 0% { opacity: 0; transform: translateY(50px); } 100% { opacity: 1; transform: translateY(0); } }",
    },
    Animation {
        class: "animate-spin-clockwise",
        shorthand: "spin-clockwise 0.6s linear both",
        keyframes: "@keyframes spin-clockwise { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }",
    },
    Animation {
        class: "animate-spin-counter-clockwise",
        shorthand: "spin-counter-clockwise 0.6s linear both",
        keyframes: "@keyframes spin-counter-clockwise { 0% { transform: rotate(0deg); } 100% { transform: rotate(-360deg); } }",
    },
    Animation {
        class: "animate-squeeze",
        shorthand: "squeeze 0.6s ease-in-out both",
        keyframes: "@keyframes squeeze { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.1, 0.9); } }",
    },
    Animation {
        class: "animate-sway",
        shorthand: "sway 0.6s ease-out both",
        keyframes: "@keyframes sway { 0% { transform: rotate(0deg); } 50% { transform: rotate(15deg); } 100% { transform: rotate(0deg); } }",
    },
    Animation {
        class: "animate-swing",
        shorthand: "swing 1s ease-in-out both",
        keyframes: "@keyframes swing { 0% { transform: rotate(0deg); } 50% { transform: rotate(15deg); } 100% { transform: rotate(0deg); } }",
    },
    Animation {
        class: "animate-swing-drop-in",
        shorthand: "swing-drop-in 0.6s ease-out both",
        keyframes: "@keyframes swing-drop-in { 0% { transform: rotate(-30deg) translateY(-50px); opacity: 0; } 100% { transform: rotate(0deg) translateY(0); opacity: 1; } }",
    },
    Animation {
        class: "animate-tada",
        shorthand: "tada 1s ease-in-out both",
        keyframes: "@keyframes tada { 0% { transform: scale(1); } 10% { transform: scale(0.9) rotate(-3deg); } 20% { transform: scale(0.9) rotate(-3deg); } 30% { transform: scale(1.1) rotate(3deg); } 40% { transform: scale(1.1) rotate(-3deg); } 50% { transform: scale(1.1) rotate(3deg); } 60% { transform: scale(1.1) rotate(-3deg); } 70% { transform: scale(1.1) rotate(3deg); } 80% { transform: scale(1.1) rotate(3deg); } 90% { transform: scale(1.1) rotate(3deg); } 100% { transform: scale(1) rotate(0); } }",
    },
    Animation {
        class: "animate-tilt",
        shorthand: "tilt 0.6s ease-in-out both",
        keyframes: "@keyframes tilt { 0% { transform: rotateY(0deg); } 50% { transform: rotateY(20deg); } 100% { transform: rotateY(0deg); } }",
    },
    Animation {
        class: "animate-vertical-bounce",
        shorthand: "vertical-bounce 0.6s ease-in-out both",
        keyframes: "@keyframes vertical-bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-20px); } }",
    },
    Animation {
        class: "animate-wobble",
        shorthand: "wobble 1s ease-in-out both",
        keyframes: "@keyframes wobble { 0% { transform: translateX(0); } 15% { transform: translateX(-20px); } 30% { transform: translateX(20%); } 45% { transform: translateX(-15%); } 60% { transform: translateX(20px); } 75% { transform: translateX(-5%); } 100% { transform: translateX(0); } }",
    },
    Animation {
        class: "animate-zoom-in",
        shorthand: "zoom-in 0.6s ease-out both",
        keyframes: "@keyframes zoom-in { 0% { opacity: 0; transform: scale(.5); } 100% { opacity: 1; transform: scale(1); } }",
    },
    Animation {
        class: "animate-zoom-out",
        shorthand: "zoom-out 0.6s ease-out both",
        keyframes: "@keyframes zoom-out { 0% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(.5); } }",
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
    fn inventory_is_complete() {
        // 79 upstream `--animate-*` custom properties (vendor/tailwind-animations-8eb93d9/index.css)
        // minus 1 (`animate-pulse` is byte-identical to aihu's pre-existing
        // built-in, so it isn't re-registered here — see `builtins_are_not_shadowed`)
        // = 78. This is the port doc's Slice 10 completeness gate: every
        // ported animation from Slices 1-10 must be present, asserted
        // against the real vendored count, not a hand-maintained number.
        assert_eq!(
            ANIMATIONS.len(),
            78,
            "expected all 78 non-builtin tailwind-animations entries to be ported"
        );
    }

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
