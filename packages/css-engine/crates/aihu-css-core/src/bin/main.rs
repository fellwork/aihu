//! aihu-css-compile — CLI entry for the engine.
//!
//! Two input modes:
//!
//! - **Class-list mode** (Plan 1, default): reads utility class names (one per
//!   line / whitespace-separated) from stdin or a file argument, emits flat
//!   `.class { … }` CSS to stdout.
//! - **AST mode** (Plan 2, `--ast-json`): reads an `SfcAst` JSON (the output of
//!   `aihu-compile --ast-json`) from stdin, emits scoped shadow-DOM CSS.

use std::io::{self, Read, Write};

fn main() {
    let argv: Vec<String> = std::env::args().collect();

    // Build-time mode: dump the conflict-group map (Plan 3 Task 9). The TS build
    // step (`scripts/gen-cn-conflict-map.ts`) reads this to generate the `cn()`
    // conflict map, so the runtime merge map never drifts from the utility table.
    if argv.iter().any(|a| a == "--dump-conflict-groups") {
        let groups = aihu_css_core::tokens::conflict_groups();
        let json = serde_json::to_string(&groups).expect("serialize conflict groups");
        println!("{json}");
        return;
    }

    let ast_mode = argv.iter().any(|a| a == "--ast-json");

    // Positional file arg = first non-flag argument after argv[0].
    let file_arg = argv
        .iter()
        .skip(1)
        .find(|a| !a.starts_with("--"))
        .cloned();

    let mut buf = String::new();
    match &file_arg {
        Some(path) => {
            buf = std::fs::read_to_string(path).unwrap_or_else(|e| {
                eprintln!("aihu-css-compile: failed to read {path}: {e}");
                std::process::exit(2);
            });
        }
        None => {
            io::stdin()
                .read_to_string(&mut buf)
                .expect("failed reading stdin");
        }
    }

    let css = if ast_mode {
        let ast = aihu_css_core::parse_ast(&buf).unwrap_or_else(|e| {
            eprintln!("aihu-css-compile: {e}");
            std::process::exit(1);
        });
        aihu_css_core::compile_sfc_scoped(&ast).unwrap_or_else(|e| {
            eprintln!("aihu-css-compile: {e}");
            std::process::exit(1);
        })
    } else {
        let classes: Vec<String> = buf
            .lines()
            .flat_map(|line| line.split_whitespace())
            .filter(|s| !s.is_empty())
            .map(String::from)
            .collect();
        aihu_css_core::compile_classes(&classes)
    };

    let stdout = io::stdout();
    let mut handle = stdout.lock();
    handle
        .write_all(css.as_bytes())
        .expect("failed writing stdout");
}
