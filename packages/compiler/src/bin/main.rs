use std::io::Read;
use std::process;

fn main() {
    let args: Vec<String> = std::env::args().collect();

    let stdin_mode = args.contains(&"--stdin".to_string());

    // Parse --out <dir>
    let out_dir: Option<String> = {
        let pos = args.iter().position(|a| a == "--out");
        match pos {
            Some(i) => {
                if i + 1 >= args.len() {
                    eprintln!("error: --out requires a directory argument");
                    process::exit(1);
                }
                Some(args[i + 1].clone())
            }
            None => None,
        }
    };

    // v0.6.4: Parse --target <client|server|universal> (default: universal).
    let target = {
        let pos = args.iter().position(|a| a == "--target");
        match pos {
            Some(i) => {
                if i + 1 >= args.len() {
                    eprintln!("error: --target requires a value (client|server|universal)");
                    process::exit(1);
                }
                match args[i + 1].as_str() {
                    "client" => aihu_compiler::BuildTarget::Client,
                    "server" => aihu_compiler::BuildTarget::Server,
                    "universal" => aihu_compiler::BuildTarget::Universal,
                    other => {
                        eprintln!("error: unknown --target '{}' (expected: client|server|universal)", other);
                        process::exit(1);
                    }
                }
            }
            None => aihu_compiler::BuildTarget::Universal,
        }
    };

    let (source, file_stem, file_label, file_path_opt) = if stdin_mode {
        // Parse --tag <name>
        let tag_pos = args.iter().position(|a| a == "--tag");
        let tag = match tag_pos {
            Some(i) if i + 1 < args.len() => args[i + 1].clone(),
            _ => {
                eprintln!("error: --stdin mode requires --tag <name>");
                process::exit(1);
            }
        };

        let mut src = String::new();
        std::io::stdin()
            .read_to_string(&mut src)
            .unwrap_or_else(|e| {
                eprintln!("error reading stdin: {}", e);
                process::exit(1);
            });

        // v1.x: Parse optional --path <filepath> for @route C500 check in stdin mode.
        let path_pos = args.iter().position(|a| a == "--path");
        let stdin_path: Option<String> = match path_pos {
            Some(i) if i + 1 < args.len() => Some(args[i + 1].clone()),
            _ => None,
        };

        (src, tag, "<stdin>".to_string(), stdin_path)
    } else {
        // File mode: argv[1] is the file path
        let file_path = match args.get(1) {
            Some(p) if !p.starts_with("--") => p.clone(),
            _ => {
                eprintln!("usage: aihu-compile <file.aihu> [--out <dir>] [--target <client|server|universal>]");
                process::exit(1);
            }
        };

        let src = std::fs::read_to_string(&file_path).unwrap_or_else(|e| {
            eprintln!("{}: {}", file_path, e);
            process::exit(1);
        });

        let stem = std::path::Path::new(&file_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or_else(|| {
                eprintln!("error: cannot derive stem from path '{}'", file_path);
                process::exit(1);
            })
            .to_string();

        let label = file_path.clone();
        let path_copy = file_path.clone();
        (src, stem, label, Some(path_copy))
    };

    let parsed = aihu_compiler::sfc::parse_with_path(
        &source,
        file_path_opt.as_deref(),
    ).unwrap_or_else(|e| {
        eprintln!("{}:{}: {}", file_label, e.line, e.message);
        process::exit(1);
    });

    let unit = aihu_compiler::compile_full_with_target(&parsed, target).unwrap_or_else(|e| {
        eprintln!("{}:{}: {}", file_label, e.line, e.message);
        process::exit(1);
    });

    // Tag name resolution (OQ-C6):
    // 1. @meta { name: "..." } — explicit override (highest priority)
    // 2. @route { name: "..." } — derived from route block (e.g. "blog-index")
    // 3. file_stem — basename of the source file (fallback)
    let tag_name = unit.source.meta.name.clone()
        .or_else(|| unit.source.route.as_ref().and_then(|r| r.name.clone()))
        .unwrap_or(file_stem);

    let result = aihu_compiler::emit(&unit, &tag_name);

    // B3b — optional `--sidecar-out <path>` writes the per-SFC `.aihu.ts`
    // sidecar to that exact path. Used by the Vite plugin to write the
    // sidecar adjacent to the .aihu source so `tsc --noEmit` over
    // `**/*.aihu.ts` can type-check template expressions.
    let sidecar_out_pos = args.iter().position(|a| a == "--sidecar-out");
    let sidecar_out: Option<String> = match sidecar_out_pos {
        Some(i) if i + 1 < args.len() => Some(args[i + 1].clone()),
        _ => None,
    };

    if let Some(ref path) = sidecar_out {
        if let Some(ref ts) = result.sidecar_ts {
            if let Some(parent) = std::path::Path::new(path).parent() {
                if !parent.as_os_str().is_empty() {
                    std::fs::create_dir_all(parent).unwrap_or_else(|e| {
                        eprintln!("error creating sidecar parent '{}': {}", parent.display(), e);
                        process::exit(1);
                    });
                }
            }
            std::fs::write(path, ts).unwrap_or_else(|e| {
                eprintln!("error writing sidecar '{}': {}", path, e);
                process::exit(1);
            });
        }
    }

    match out_dir {
        Some(ref dir) => {
            let out_file = format!("{}/{}.ts", dir, tag_name);
            std::fs::create_dir_all(dir).unwrap_or_else(|e| {
                eprintln!("error creating '{}': {}", dir, e);
                process::exit(1);
            });
            std::fs::write(&out_file, &result.js).unwrap_or_else(|e| {
                eprintln!("error writing '{}': {}", out_file, e);
                process::exit(1);
            });
            if !result.manifest_json.is_empty() {
                let manifest_path = format!("{}/agent-manifest.json", dir);
                std::fs::write(&manifest_path, &result.manifest_json).unwrap_or_else(|e| {
                    eprintln!("error writing '{}': {}", manifest_path, e);
                    process::exit(1);
                });
            }
            // v0.6.2: Write .route.json sidecar if present.
            if let Some(ref route_json) = result.route_json {
                let route_path = format!("{}/{}.route.json", dir, tag_name);
                std::fs::write(&route_path, route_json).unwrap_or_else(|e| {
                    eprintln!("error writing '{}': {}", route_path, e);
                    process::exit(1);
                });
            }
            // B3b — also write `<tag>.aihu.ts` next to the JS output when no
            // explicit --sidecar-out was passed.
            if sidecar_out.is_none() {
                if let Some(ref ts) = result.sidecar_ts {
                    let sidecar_path = format!("{}/{}.aihu.ts", dir, tag_name);
                    std::fs::write(&sidecar_path, ts).unwrap_or_else(|e| {
                        eprintln!("error writing sidecar '{}': {}", sidecar_path, e);
                        process::exit(1);
                    });
                }
            }
        }
        None => {
            print!("{}", result.js);
        }
    }
}
