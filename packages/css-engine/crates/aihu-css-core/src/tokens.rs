//! Bootstrap utility-class → CSS mapping.
//! Plan 2 expands this to consume the full Tailwind v4 utility table from
//! the AST scanner; Plan 3 adds variant + progressive-feature handling.

/// Map a single utility class name to its CSS body (without selector).
/// Returns None for unknown utilities.
pub fn utility_to_css(class_name: &str) -> Option<String> {
    let css = match class_name {
        // Backgrounds
        "bg-primary"            => "background-color: var(--color-primary);",
        "bg-primary-foreground" => "background-color: var(--color-primary-foreground);",

        // Text colors
        "text-primary"            => "color: var(--color-primary);",
        "text-primary-foreground" => "color: var(--color-primary-foreground);",

        // Border radius
        "rounded-sm" => "border-radius: 0.125rem;",
        "rounded-md" => "border-radius: 0.375rem;",
        "rounded-lg" => "border-radius: 0.5rem;",

        // Padding
        "p-2" => "padding: 0.5rem;",
        "p-4" => "padding: 1rem;",
        "p-8" => "padding: 2rem;",

        _ => return None,
    };
    Some(css.to_string())
}
