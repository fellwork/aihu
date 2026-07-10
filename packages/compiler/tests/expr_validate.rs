//! W2 (advanced-js-template-expressions, Option C hybrid) — end-to-end proof
//! of the `--expr-parser <legacy|ast>` flag:
//!
//! 1. valid expressions (the plan's ACCEPT fixture grammar) compile under
//!    `ast` mode and emit BYTE-IDENTICALLY to `legacy` mode (validate-only —
//!    codegen is untouched in W2; the AST rewrite is W3);
//! 2. garbage expressions produce the new C320/C321 diagnostics WITH the
//!    flag, at every capture position (interpolation / attr binding /
//!    handler / if-head / each-list / each-key / @html);
//! 3. WITHOUT the flag everything behaves exactly as before — including the
//!    legacy pipeline's acceptance of the very garbage `ast` rejects.

use aihu_compiler::{
    compile_full_with_options, compile_full_with_target, emit, sfc, BuildTarget, CompileError,
    ExprParserMode,
};

const STATE: &str = r#"@state {
const [count, setCount] = signal(0)
const [items, setItems] = signal(['a', 'b'])
const [user, setUser] = signal({ name: 'ada' })
const [nums, setNums] = signal([1, 2, 3])
const [obj, setObj] = signal({ a: 1 })
const [loading, setLoading] = signal(false)
const extra = 'x'
}
"#;

fn src_with_template(template_body: &str) -> String {
    format!("{STATE}@template {{\n  {template_body}\n}}")
}

fn compile_mode(source: &str, mode: ExprParserMode) -> Result<String, CompileError> {
    let parsed = sfc::parse(source)?;
    let unit = compile_full_with_options(&parsed, BuildTarget::Universal, mode)?;
    Ok(emit(&unit, "x-expr-validate").js)
}

fn assert_identical_both_modes(template_body: &str) {
    let source = src_with_template(template_body);
    let legacy = compile_mode(&source, ExprParserMode::Legacy)
        .unwrap_or_else(|e| panic!("legacy mode rejected `{template_body}`: {}", e.message));
    let ast = compile_mode(&source, ExprParserMode::Ast)
        .unwrap_or_else(|e| panic!("ast mode rejected `{template_body}`: {}", e.message));
    assert_eq!(
        legacy, ast,
        "W2 is validate-only: emitted JS must be byte-identical for `{template_body}`"
    );
}

/// The flag rejects `template_body` with `code`; WITHOUT the flag the legacy
/// pipeline still compiles it (proving default behavior is unchanged).
fn assert_flag_only_rejection(template_body: &str, code: &str) {
    let source = src_with_template(template_body);
    let err = compile_mode(&source, ExprParserMode::Ast)
        .err()
        .unwrap_or_else(|| panic!("ast mode must reject `{template_body}`"));
    assert_eq!(
        err.code.as_deref(),
        Some(code),
        "wrong diagnostic for `{template_body}`: {}",
        err.message
    );
    compile_mode(&source, ExprParserMode::Legacy).unwrap_or_else(|e| {
        panic!(
            "legacy pipeline must still ACCEPT `{template_body}` (behavior without \
             the flag is unchanged in W2), got: {}",
            e.message
        )
    });
}

// ─── 1. Valid expressions pass under `ast` and emit identically ─────────────

#[test]
fn accepted_grammar_emits_byte_identically_under_both_modes() {
    // Every legacy-ACCEPT row from the plan's truth table (a-series) that the
    // W1-era boundary scanner already tolerates.
    for body in [
        "<p>{user.name}</p>",
        "<p>{items.join(', ')}</p>",
        "<p>{items.filter(i => i > 1).map(i => i * 2).join(',')}</p>",
        "<p>{count > 0 ? 'many' : 'none'}</p>",
        "<p>{(() => count)()}</p>",
        "<p>{`Count: ${count}`}</p>",
        "<p>{user?.name}</p>",
        "<p>{count ?? 0}</p>",
        "<p>{Math.max(...nums)}</p>",
        "<p>{[...items, extra].length}</p>",
        "<p>{JSON.stringify({ a: 1 })}</p>",
        "<p>{new Date().getFullYear()}</p>",
        "<p>{items.map(i => { return i * 2 }).join('')}</p>",
        "<p>{{count}}</p>",
        "<p>{items.map(({ x }) => x)}</p>",
    ] {
        assert_identical_both_modes(body);
    }
}

#[test]
fn accepted_attr_handler_and_block_positions_emit_identically() {
    for body in [
        // b-series: attribute bindings + handlers.
        "<p $if={count > 0 && !loading}>yes</p>",
        "<div $class={[...items, 'x']}>c</div>",
        "<button $on.click={() => setCount(count() + 1)}>+</button>",
        "<button $on.click={(e) => { setCount(count() + 1); e.preventDefault() }}>+</button>",
        "<p $title={/a/.test(user.name) ? 'y' : 'n'}>t</p>",
        // c-series: block heads (block tags on their own lines, matching the
        // established b3_variant_b fixture style).
        "{#if count > 0}\n  <p>{count}</p>\n  {:else if loading}\n  <p>load</p>\n  {:else}\n  <p>0</p>\n  {/if}",
        "{#each items.filter(e => e.ok) as x (x.id)}\n  <p>{x.label}</p>\n  {/each}",
        "{#each Array.from({ length: count }, (_, i) => i) as n}\n  <p>{n}</p>\n  {/each}",
        "{@html user.name}",
    ] {
        assert_identical_both_modes(body);
    }
}

// ─── 2. Garbage produces the new diagnostics ONLY with the flag ──────────────

#[test]
fn syntax_garbage_is_c320_with_flag_only() {
    // The legacy brace-matcher accepts all of these (they brace-balance) and
    // silently emits broken JS; `ast` mode turns them into C320 at compile
    // time. Each probes a different capture position.
    assert_flag_only_rejection("<p>{count +}</p>", "C320"); // interpolation
    assert_flag_only_rejection("<p>{items.}</p>", "C320"); // interpolation, member
    assert_flag_only_rejection("<p $title={count ===}>t</p>", "C320"); // attr binding
    assert_flag_only_rejection("<button $on.click={() =>}>x</button>", "C320"); // handler
    assert_flag_only_rejection("{#if count ===}\n  <p>y</p>\n  {/if}", "C320"); // if-head
    assert_flag_only_rejection(
        "{#each items. as it}\n  <p>{it}</p>\n  {/each}", // each-list
        "C320",
    );
    assert_flag_only_rejection(
        "{#each items as it (it.)}\n  <p>{it}</p>\n  {/each}", // each-key
        "C320",
    );
    assert_flag_only_rejection("{@html user.}", "C320"); // @html
}

#[test]
fn contract_violations_are_c321_with_flag_only() {
    // Parseable-but-disallowed forms (plan Contract): statements, sequence
    // commas, assignment/update outside handler position.
    assert_flag_only_rejection("<p>{const x = 1}</p>", "C321");
    assert_flag_only_rejection("<p>{count, extra}</p>", "C321");
    assert_flag_only_rejection("<p>{count = 5}</p>", "C321");
    assert_flag_only_rejection("<p $title={count++}>t</p>", "C321");
    assert_flag_only_rejection("<p>{setCount(1); count}</p>", "C321");
}

#[test]
fn assignment_is_permitted_in_handler_position() {
    // The Contract carve-out: `$on.*` handlers may assign/update at the root.
    assert_identical_both_modes("<button $on.click={count = 5}>set</button>");
    assert_identical_both_modes("<button $on.click={count++}>inc</button>");
}

// ─── 3. Diagnostic quality bar (plan §Contract / W2) ─────────────────────────

#[test]
fn c320_diagnostic_carries_span_token_and_anchor() {
    let source = src_with_template("<p>{count +}</p>");
    let parsed = sfc::parse(&source).unwrap();
    let err = compile_full_with_options(&parsed, BuildTarget::Universal, ExprParserMode::Ast)
        .err()
        .expect("ast mode must reject `count +`");
    assert_eq!(err.code.as_deref(), Some("C320"));
    // Message names the position and quotes the capture.
    assert!(err.message.contains("interpolation"), "{}", err.message);
    assert!(err.message.contains("`{count +}`"), "{}", err.message);
    // `from` carries the verbatim expression so `render_human_error` can
    // anchor a codeframe on the real `.aihu` line (unique-match search).
    assert_eq!(err.from.as_deref(), Some("count +"));
    assert!(err.hint.is_some());
    assert!(err.fix.is_some());
}

#[test]
fn c321_diagnostic_uses_the_contract_steering_text() {
    let source = src_with_template("<p>{count = 5}</p>");
    let parsed = sfc::parse(&source).unwrap();
    let err = compile_full_with_options(&parsed, BuildTarget::Universal, ExprParserMode::Ast)
        .err()
        .expect("ast mode must reject `count = 5`");
    assert_eq!(err.code.as_deref(), Some("C321"));
    assert!(
        err.message.contains("move multi-statement or effectful logic into `$action`"),
        "{}",
        err.message
    );
    assert!(err.message.contains("`$computed`"), "{}", err.message);
}

// ─── Default plumbing ────────────────────────────────────────────────────────

#[test]
fn compile_full_with_target_defaults_to_legacy() {
    // The pre-W2 public entry point must behave as if the flag were never
    // passed — garbage that legacy accepts still compiles through it.
    let source = src_with_template("<p>{count +}</p>");
    let parsed = sfc::parse(&source).unwrap();
    assert!(
        compile_full_with_target(&parsed, BuildTarget::Universal).is_ok(),
        "compile_full_with_target must stay flag-off (legacy)"
    );
}

#[test]
fn mode_parsing_matches_flag_surface() {
    assert_eq!(ExprParserMode::parse("legacy"), Some(ExprParserMode::Legacy));
    assert_eq!(ExprParserMode::parse("ast"), Some(ExprParserMode::Ast));
    assert_eq!(ExprParserMode::parse("AST"), None);
    assert_eq!(ExprParserMode::default(), ExprParserMode::Legacy);
}
