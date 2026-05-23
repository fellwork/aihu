//! aihu-css-compile — CLI entry for the engine.
//!
//! Reads class names (one per line) from stdin or a file argument, emits
//! CSS to stdout. Plan 1 bootstrap version. Plan 2+ adds argument flags
//! for scoped output, style pack selection, and AST input mode.

use std::io::{self, Read, Write};

fn main() {
    let mut buf = String::new();
    let argv: Vec<String> = std::env::args().collect();

    if argv.len() >= 2 {
        // File mode: aihu-css-compile path/to/input.txt
        buf = std::fs::read_to_string(&argv[1]).unwrap_or_else(|e| {
            eprintln!("aihu-css-compile: failed to read {}: {}", argv[1], e);
            std::process::exit(2);
        });
    } else {
        // Stdin mode: cat classes.txt | aihu-css-compile
        io::stdin()
            .read_to_string(&mut buf)
            .expect("failed reading stdin");
    }

    let classes: Vec<String> = buf
        .lines()
        .flat_map(|line| line.split_whitespace())
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect();

    let css = aihu_css_core::compile_classes(&classes);
    let stdout = io::stdout();
    let mut handle = stdout.lock();
    handle
        .write_all(css.as_bytes())
        .expect("failed writing stdout");
}
