//! Incremental-cache tests (Plan 2 Task 8): a hit returns identical output and
//! skips recompilation; an AST or theme-version change invalidates the entry.

use std::time::Instant;

use aihu_css_core::{parse_ast, CssCache, SfcAst};

fn sfc(classes: &str) -> SfcAst {
    parse_ast(&format!(
        r#"{{"tag":"X","astVersion":1,"style":null,"meta":{{"name":"X"}},
        "template":[{{"kind":"element","tag":"div","attrs":[
          {{"kind":"static","name":"class","value":"{classes}"}}
        ],"children":[]}}]}}"#
    ))
    .unwrap()
}

#[test]
fn hit_returns_identical_output_and_skips_recompile() {
    let mut cache = CssCache::new();
    let ast = sfc("bg-primary p-4");

    let first = cache.compile(&ast, 1).unwrap();
    assert_eq!(cache.recompiles(), 1, "first compile is a miss");
    assert_eq!(cache.hits(), 0);

    let second = cache.compile(&ast, 1).unwrap();
    assert_eq!(second, first, "cache hit returns byte-identical output");
    assert_eq!(cache.recompiles(), 1, "second compile must NOT recompile");
    assert_eq!(cache.hits(), 1, "second compile is a hit");
}

#[test]
fn ast_change_invalidates_entry() {
    let mut cache = CssCache::new();
    cache.compile(&sfc("p-4"), 1).unwrap();
    cache.compile(&sfc("p-8"), 1).unwrap(); // different class → different hash
    assert_eq!(cache.recompiles(), 2, "a changed AST recompiles");
    assert_eq!(cache.hits(), 0);
}

#[test]
fn theme_version_change_invalidates_entry() {
    let mut cache = CssCache::new();
    let ast = sfc("bg-primary");
    cache.compile(&ast, 1).unwrap();
    cache.compile(&ast, 2).unwrap(); // theme bumped → invalidate
    assert_eq!(cache.recompiles(), 2, "a theme-version bump recompiles");
}

#[test]
fn cache_hit_is_well_under_30ms() {
    let mut cache = CssCache::new();
    // Warm the cache.
    let ast = sfc("bg-primary p-4 rounded-lg hover:bg-accent md:p-8 host:text-primary");
    let _ = cache.compile(&ast, 1).unwrap();

    // Time 1000 cache hits; each must be far below the 30 ms per-SFC bar.
    let start = Instant::now();
    for _ in 0..1000 {
        let _ = cache.compile(&ast, 1).unwrap();
    }
    let elapsed = start.elapsed();
    let per_hit = elapsed / 1000;
    assert!(
        per_hit.as_micros() < 30_000,
        "cache hit took {per_hit:?} (>30ms bar)"
    );
    assert_eq!(cache.hits(), 1000);
    assert_eq!(cache.recompiles(), 1, "only the warm-up compiled");
}
