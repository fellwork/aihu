use std::io::Read;
use std::process;

/// Emit a CompileError as a JSON object to stderr.
/// Used when `--machine-errors` flag (or AIHU_MACHINE_ERRORS=1 env var) is set.
/// Format: { "code", "message", "from", "to", "range" }
fn emit_machine_error(e: &aihu_compiler::CompileError) {
    use std::io::Write;

    // range is line/col from the error; col and end positions may be 0 when unknown.
    let range_json = if e.line > 0 {
        format!(
            r#"{{"line":{},"col":{},"end_line":{},"end_col":{}}}"#,
            e.line, e.col, e.line, e.col
        )
    } else {
        "null".to_string()
    };

    let escape = |s: &str| -> String {
        s.replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
            .replace('\r', "\\r")
            .replace('\t', "\\t")
    };

    let code = e.code.as_deref().unwrap_or("");
    let message = escape(&e.message);
    let from = match &e.from {
        Some(f) => format!("\"{}\"", escape(f)),
        None => "null".to_string(),
    };
    let to = match &e.to {
        Some(t) => format!("\"{}\"", escape(t)),
        None => "null".to_string(),
    };

    let json = format!(
        r#"{{"code":"{}","message":"{}","from":{},"to":{},"range":{}}}"#,
        escape(code), message, from, to, range_json
    );

    let _ = writeln!(std::io::stderr(), "{}", json);
}

/// Render a `CompileError` as a rich, human-readable diagnostic to stderr.
///
/// r2 dx-tooling — the binary previously emitted a single
/// `file:LINE: message` line and discarded `hint`/`fix`/`from`/`to` plus the
/// source codeframe. This renders, when present:
///   - `file:line:col: message` header (degrades to `file: message` when no
///     position is known — ~142 call-sites still emit `line:0/col:0`)
///   - a codeframe: the offending source line(s) with a caret underline
///     spanning the `from` text where it can be located on that line
///   - `hint:` — why this is wrong
///   - `fix:` — the suggested remedy
///   - `replace:` / `with:` — the machine `from`→`to` rewrite (handy for AIs)
///
/// Output shape is intentionally additive: the first line is still the
/// familiar `file:line: message` (line omitted/0 preserved), so existing
/// log-scraping that only reads line 1 keeps working. The `--machine-errors`
/// JSON path (`emit_machine_error`) is untouched.
fn render_human_error(e: &aihu_compiler::CompileError, file_label: &str, source: &str) {
    use std::io::Write;
    let mut w = std::io::stderr();

    // ── Locate a trustworthy codeframe line ──────────────────────────────────
    //
    // Position handling is deliberately conservative (r2 dx-tooling scope: do
    // NOT chase the ~142 `line:0`/block-relative position sites in this pass).
    // We render a codeframe ONLY when we can anchor it to a real file line:
    //
    //   1. `from` literal located verbatim in the source — the most reliable
    //      anchor. Correct even for codes whose `e.line` is block-relative
    //      (e.g. C305's `@click=`), because we search the WHOLE source for the
    //      exact offending text. We require a UNIQUE match to avoid pointing at
    //      the wrong occurrence.
    //   2. else `e.line > 0` AND that line plausibly file-relative — used by
    //      block-parser codes like C204 whose `line` IS the file line.
    //
    // When neither holds we degrade gracefully to message + hint + fix + the
    // machine `from`→`to` rewrite, with no (potentially misleading) codeframe.
    let from_literal = e.from.as_deref().filter(|f| {
        // A literal source anchor must (a) occur exactly once and (b) not be a
        // placeholder pattern (our `from` strings sometimes embed `...`/`{expr}`
        // which are illustrative, not verbatim source).
        !f.is_empty()
            && !f.contains("...")
            && !f.contains("{expr}")
            && !f.contains("{fn}")
            && source.matches(*f).count() == 1
    });

    let anchor: Option<(usize, usize, usize)> = if let Some(from) = from_literal {
        // Byte offset of the unique `from` match → (line, col, len).
        let byte_idx = source.find(from).unwrap();
        let line = source[..byte_idx].bytes().filter(|b| *b == b'\n').count() + 1;
        let line_start = source[..byte_idx].rfind('\n').map(|i| i + 1).unwrap_or(0);
        let col = source[line_start..byte_idx].chars().count();
        Some((line, col, from.chars().count().max(1)))
    } else if e.line > 0 {
        // Block-parser codes (C204) carry a real file line; col may be 0.
        let col = if e.col > 0 { e.col - 1 } else { 0 };
        let len = e
            .from
            .as_deref()
            .filter(|f| !f.is_empty() && !f.contains("..."))
            .map(|f| f.chars().count())
            .unwrap_or(0);
        Some((e.line, col, len))
    } else {
        None
    };

    // ── Header — `file:line:col: message`, degrading to `file: message`. ──────
    match anchor {
        Some((line, col, _)) if col > 0 => {
            let _ = writeln!(w, "{}:{}:{}: {}", file_label, line, col + 1, e.message);
        }
        Some((line, _, _)) => {
            let _ = writeln!(w, "{}:{}: {}", file_label, line, e.message);
        }
        None => {
            // No trustworthy position. Keep the historical `file: message`
            // shape (no bogus line number).
            let _ = writeln!(w, "{}: {}", file_label, e.message);
        }
    }

    // ── Codeframe ─────────────────────────────────────────────────────────────
    if let Some((line, col, len)) = anchor {
        if let Some(src_line) = source.lines().nth(line - 1) {
            let gutter = format!("{} | ", line);
            let _ = writeln!(w, "{}{}", gutter, src_line);

            let underline_len = if len > 0 {
                len
            } else {
                // Whole (trimmed) line when we have no span.
                src_line.trim_end().chars().count().max(1)
            };
            let pad: String = std::iter::repeat(' ').take(gutter.len() + col).collect();
            let carets: String = std::iter::repeat('^').take(underline_len).collect();
            let _ = writeln!(w, "{}{}", pad, carets);
        }
    }

    // The `hint:` / `fix:` / `replace:` / `with:` tail is shared with the
    // WARNING channel (`crate::diagnostics::emit_warning`), so the two shapes
    // cannot drift. Only the header and codeframe above are error-specific — a
    // parse-time warning has no file/line/col to anchor a codeframe to.
    aihu_compiler::diagnostics::write_tail(&mut w, e);
}

/// O1a (tag naming): normalize the resolved define-name (`@meta name` →
/// `@route name` → file stem) to its kebab custom-element form, so the
/// registered element matches emitted `branch(...)` references and the
/// manifest (`UserCard.aihu` → `user-card`). This is an INFALLIBLE transform:
/// a single-word define-name (`Comment`, `timer`) that can't carry a hyphen
/// keeps the historical emit-time hyphen WARNING rather than erroring — only
/// component *references* in a template are a hard C450 (see
/// `validate_component_tags` in lib.rs). Lowercase non-component names pass
/// through unchanged.
fn normalize_define_tag(raw: &str) -> String {
    if aihu_compiler::tags::is_component_tag(raw) {
        aihu_compiler::tags::kebab_component_tag(raw)
    } else {
        raw.to_string()
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();

    // --machine-errors flag OR AIHU_MACHINE_ERRORS=1 env var: emit JSON diagnostics to stderr.
    let machine_errors = args.contains(&"--machine-errors".to_string())
        || std::env::var("AIHU_MACHINE_ERRORS").as_deref() == Ok("1");

    let stdin_mode = args.contains(&"--stdin".to_string());

    // W2 (advanced-js-template-expressions): `--expr-parser <legacy|ast>` OR
    // AIHU_EXPR_PARSER env var (flag wins; mirrors the --machine-errors /
    // AIHU_MACHINE_ERRORS pattern above). Default: legacy (off).
    // `ast` = validate every captured template expression with oxc
    // (C320/C321 on failure); emitted code is unchanged either way.
    let expr_parser = {
        let pos = args.iter().position(|a| a == "--expr-parser");
        match pos {
            Some(i) => {
                let value = args.get(i + 1).map(String::as_str).unwrap_or("");
                match aihu_compiler::ExprParserMode::parse(value) {
                    Some(mode) => mode,
                    None => {
                        eprintln!(
                            "error: --expr-parser requires a value (legacy|ast), got '{}'",
                            value
                        );
                        process::exit(1);
                    }
                }
            }
            None => aihu_compiler::ExprParserMode::from_env().unwrap_or_default(),
        }
    };

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
                eprintln!("usage: aihu-compile <file.aihu> [--out <dir>] [--target <client|server|universal>] [--expr-parser <legacy|ast>]");
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

    // Envelope mode — `--envelope <options-json>`: single-parse, multi-target,
    // multi-output compile emitting ONE JSON envelope to stdout. Checked BEFORE
    // the legacy single-output flags so a caller may pass BOTH (e.g.
    // `--ast-json --envelope {...}`): a binary that knows `--envelope` answers
    // with the envelope; an older binary ignores the unknown flag and answers
    // with the legacy artifact — which is how the JS driver feature-detects
    // envelope support without a probe spawn (the envelope JSON carries the
    // `"envelope"` discriminant field; legacy outputs never do).
    //
    // The options JSON (`EnvelopeOptions`, camelCase) carries tag/path/targets/
    // emits/exprParser; the legacy `--tag`/`--path`/`--target` flags fill any
    // OMITTED fields so existing spawn call-sites can add `--envelope` without
    // restating themselves.
    if let Some(i) = args.iter().position(|a| a == "--envelope") {
        let on_err = |e: &aihu_compiler::CompileError| -> ! {
            if machine_errors {
                emit_machine_error(e);
                eprintln!("{}:{}: {}", file_label, e.line, e.message);
            } else {
                render_human_error(e, &file_label, &source);
            }
            process::exit(1);
        };
        let opts_json = match args.get(i + 1).filter(|a| !a.starts_with("--")) {
            Some(j) => j.clone(),
            None => "{}".to_string(),
        };
        let mut opts: aihu_compiler::EnvelopeOptions = match serde_json::from_str(&opts_json) {
            Ok(o) => o,
            Err(e) => {
                eprintln!("error: --envelope options are not valid JSON: {}", e);
                process::exit(1);
            }
        };
        // Fill omitted fields from the legacy flags / file-mode derivations.
        if opts.tag.is_none() {
            opts.tag = Some(file_stem.clone());
        }
        if opts.path.is_none() {
            opts.path = file_path_opt.clone();
        }
        if opts.targets.is_empty() {
            opts.targets = vec![match target {
                aihu_compiler::BuildTarget::Client => "client",
                aihu_compiler::BuildTarget::Server => "server",
                aihu_compiler::BuildTarget::Universal => "universal",
            }
            .to_string()];
        }
        if opts.expr_parser.is_none() {
            // The CLI flag/env already resolved above; thread it through so the
            // envelope and legacy paths cannot disagree.
            opts.expr_parser = Some(
                match expr_parser {
                    aihu_compiler::ExprParserMode::Legacy => "legacy",
                    aihu_compiler::ExprParserMode::Ast => "ast",
                }
                .to_string(),
            );
        }
        if !opts.strict_templates {
            opts.strict_templates = args.iter().any(|a| a == "--strict-templates");
        }
        let envelope =
            aihu_compiler::compile_envelope(&source, &opts).unwrap_or_else(|e| on_err(&e));
        match serde_json::to_string(&envelope) {
            Ok(json) => {
                println!("{}", json);
                process::exit(0);
            }
            Err(e) => {
                eprintln!("error serializing envelope: {}", e);
                process::exit(1);
            }
        }
    }

    // v1.0.10a — `--ast-json`: parse → owned AST → emit JSON to stdout, then
    // short-circuit BEFORE codegen (no TS produced). Purely additive: existing
    // flags/behavior below are untouched. Respects the same `--machine-errors`
    // diagnostic path on parse failure.
    if args.contains(&"--ast-json".to_string()) {
        let on_err = |e: &aihu_compiler::CompileError| -> ! {
            if machine_errors {
                // Machine mode is preserved byte-for-byte: JSON line followed
                // by the legacy `file:line: message` human line (unchanged).
                emit_machine_error(e);
                eprintln!("{}:{}: {}", file_label, e.line, e.message);
            } else {
                render_human_error(e, &file_label, &source);
            }
            process::exit(1);
        };
        let parsed_ast = aihu_compiler::sfc::parse_with_path(&source, file_path_opt.as_deref())
            .unwrap_or_else(|e| on_err(&e));
        let unit = aihu_compiler::compile_full_with_options(&parsed_ast, target, expr_parser)
            .unwrap_or_else(|e| on_err(&e));
        let mut ast = aihu_compiler::build_owned_ast(&unit, file_path_opt.as_deref());
        // Apply the CLI's authoritative stem resolution (OQ-C6):
        // @meta { name } → @route { name } → file_stem (the `--tag` value in
        // stdin mode, basename in file mode). build_owned_ast already honors
        // meta/route, so only override the file-stem fallback to the
        // CLI-supplied stem.
        let stem_fallback = unit
            .source
            .meta
            .name
            .clone()
            .or_else(|| unit.source.route.as_ref().and_then(|r| r.name.clone()))
            .unwrap_or_else(|| file_stem.clone());
        // O1a (tag naming): normalize the define-name (PascalCase→kebab).
        let stem_fallback = normalize_define_tag(&stem_fallback);
        ast.tag = stem_fallback.clone();
        ast.meta.name = stem_fallback;
        match serde_json::to_string(&ast) {
            Ok(json) => {
                println!("{}", json);
                process::exit(0);
            }
            Err(e) => {
                eprintln!("error serializing AST: {}", e);
                process::exit(1);
            }
        }
    }

    // `--route-json`: parse → compile → print the `.route.json` sidecar to
    // stdout, then short-circuit BEFORE the normal codegen output. Lets build
    // tools (e.g. @aihu/router's `genR`) recover full route metadata
    // (name/layout/head/middleware/params/ssr) from stdin without writing a
    // sidecar to disk — the stdin compile path never persists one. Prints the
    // literal `null` when the SFC declares no `@route` block.
    if args.contains(&"--route-json".to_string()) {
        let on_err = |e: &aihu_compiler::CompileError| -> ! {
            if machine_errors {
                emit_machine_error(e);
                eprintln!("{}:{}: {}", file_label, e.line, e.message);
            } else {
                render_human_error(e, &file_label, &source);
            }
            process::exit(1);
        };
        let parsed_rj = aihu_compiler::sfc::parse_with_path(&source, file_path_opt.as_deref())
            .unwrap_or_else(|e| on_err(&e));
        let unit = aihu_compiler::compile_full_with_options(&parsed_rj, target, expr_parser)
            .unwrap_or_else(|e| on_err(&e));
        let tag_name = unit
            .source
            .meta
            .name
            .clone()
            .or_else(|| unit.source.route.as_ref().and_then(|r| r.name.clone()))
            .unwrap_or_else(|| file_stem.clone());
        // O1a (tag naming): normalize the define-name (PascalCase→kebab).
        let tag_name = normalize_define_tag(&tag_name);
        let result = aihu_compiler::emit(&unit, &tag_name);
        match result.route_json {
            Some(ref rj) => println!("{}", rj),
            None => println!("null"),
        }
        process::exit(0);
    }

    let parsed = aihu_compiler::sfc::parse_with_path(
        &source,
        file_path_opt.as_deref(),
    ).unwrap_or_else(|e| {
        if machine_errors {
            emit_machine_error(&e);
            eprintln!("{}:{}: {}", file_label, e.line, e.message);
        } else {
            render_human_error(&e, &file_label, &source);
        }
        process::exit(1);
    });

    let unit = aihu_compiler::compile_full_with_options(&parsed, target, expr_parser).unwrap_or_else(|e| {
        if machine_errors {
            emit_machine_error(&e);
            eprintln!("{}:{}: {}", file_label, e.line, e.message);
        } else {
            render_human_error(&e, &file_label, &source);
        }
        process::exit(1);
    });

    // Tag name resolution (OQ-C6):
    // 1. @meta { name: "..." } — explicit override (highest priority)
    // 2. @route { name: "..." } — derived from route block (e.g. "blog-index")
    // 3. file_stem — basename of the source file (fallback)
    let tag_name = unit.source.meta.name.clone()
        .or_else(|| unit.source.route.as_ref().and_then(|r| r.name.clone()))
        .unwrap_or(file_stem);

    // O1a (tag naming): normalize the define-name (PascalCase→kebab) so the
    // registered custom element matches emitted `branch(...)` references and
    // the manifest. A single-word define-name keeps the emit-time hyphen
    // WARNING; only component *references* are a hard C450 (see lib.rs).
    let tag_name = normalize_define_tag(&tag_name);

    // #486 step 4 — `--strict-templates` switches the sidecar's attribute/
    // component-prop type layer on. Default-off keeps the type-check surface
    // byte-identical (the flag affects ONLY `sidecar_ts`, never the JS).
    let strict_templates = args.iter().any(|a| a == "--strict-templates");
    let result = aihu_compiler::emit_with_options(&unit, &tag_name, strict_templates);

    // B3b — optional `--sidecar-out <path>` writes the per-SFC `.aihu.ts`
    // sidecar to that exact path. Used by the Vite plugin to write the
    // sidecar adjacent to the .aihu source so `tsc --noEmit` over
    // `**/*.aihu.ts` can type-check template expressions.
    let sidecar_out_pos = args.iter().position(|a| a == "--sidecar-out");
    let sidecar_out: Option<String> = match sidecar_out_pos {
        Some(i) if i + 1 < args.len() => Some(args[i + 1].clone()),
        _ => None,
    };

    // `--sidecar-stdout` prints the type-check surface to stdout INSTEAD of the
    // emitted JS, so a caller can hold it in memory. This is what lets `aihu-tsc`
    // hand `.aihu` files to TypeScript as virtual files: no `.aihu.ts` is written
    // next to the source for the type-checker to find.
    //
    // Exits 0 with no output when the SFC has no @template (no surface to check),
    // so callers can treat empty output as "nothing to check", not as a failure.
    if args.iter().any(|a| a == "--sidecar-stdout") {
        if let Some(ref ts) = result.sidecar_ts {
            print!("{ts}");
        }
        process::exit(0);
    }

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
