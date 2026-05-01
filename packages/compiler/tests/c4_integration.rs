/// C4-6 Integration test: @scribe/compiler transform() produces TypeScript from .scribe source.
///
/// Uses `bun run integrate.ts` in the fixture directory, which calls transform() directly
/// from the @scribe/compiler package, writes dist/counter.ts, and asserts defineElement output.
///
/// PRECONDITIONS (manual — not auto-built by Moon):
///   1. `cd packages/compiler && cargo build --release`
///      Produces `target/release/scribe-compile.exe` used by the transform() function.
///   2. `bun install` at repo root (workspace-level install).
///   3. `cd packages/compiler && bun run build`
///      Produces `dist/index.js` so `@scribe/compiler` resolves correctly.
///
/// Run with: `cargo test -- --ignored c4_transform_produces_typescript`
#[test]
#[ignore]
fn c4_transform_produces_typescript() {
    use std::path::Path;
    use std::process::Command;

    let pkg_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let fixture_dir = pkg_dir.join("fixtures/vite-counter");

    let dist_dir = fixture_dir.join("dist");
    if dist_dir.exists() {
        std::fs::remove_dir_all(&dist_dir).expect("failed to clean fixture dist/");
    }

    let output = Command::new("bun")
        .args(["run", "integrate.ts"])
        .current_dir(&fixture_dir)
        .output()
        .expect("failed to spawn `bun run integrate.ts` — is bun installed?");

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        panic!(
            "`bun run integrate.ts` failed:\nstdout: {}\nstderr: {}",
            stdout, stderr
        );
    }

    let out_file = dist_dir.join("counter.ts");
    assert!(out_file.exists(), "dist/counter.ts was not created");

    let content = std::fs::read_to_string(&out_file).expect("failed to read dist/counter.ts");
    assert!(
        content.contains("defineElement("),
        "dist/counter.ts does not contain defineElement"
    );
    assert!(
        content.contains("defineComponent("),
        "dist/counter.ts does not contain defineComponent"
    );
}
