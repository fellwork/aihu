//! Embeds the git sha this binary was built from, so the running CLI can say
//! what source it came from.
//!
//! WHY THIS EXISTS (C-SWARM-DEPLOY-GAP)
//!   `~/.swarm/bin/swarm-bus` is installed by hand. Merging a `packages/swarm`
//!   PR changes nothing about the binary anyone actually runs, and nobody owned
//!   the rebuild+reinstall step — so the live bus spent a day running code
//!   older than three merged PRs while every verdict "verified from source"
//!   described code that was not executing. #662 shipped a closed verb enum
//!   that #664 says would have jammed the swarm; it never did, purely because
//!   nobody deployed it. THE PROTECTION WAS ACCIDENTAL.
//!
//!   A binary that cannot say where it came from cannot be caught being stale.
//!
//! BEST-EFFORT BY CONSTRUCTION. Every failure path here yields "unknown"
//! rather than failing the build: this crate must still compile from a release
//! tarball, a vendored copy, or any tree with no `git` on PATH. An unknown
//! stamp degrades the staleness check to silence, never to a broken build.

use std::process::Command;

fn main() {
    // Rebuild when HEAD moves, or the stamp silently describes an older commit
    // than the one being compiled — which is precisely the class of lie this
    // file exists to prevent.
    println!("cargo:rerun-if-changed=../../.git/HEAD");
    println!("cargo:rerun-if-changed=../../.git/refs/heads");

    let sha = git(&["rev-parse", "HEAD"]).unwrap_or_else(|| "unknown".to_string());

    // Marked explicitly rather than left to the reader: a stamp from a tree with
    // uncommitted changes does NOT identify the running code, and saying so is
    // cheaper than someone trusting it.
    let dirty = match git(&["status", "--porcelain", "--untracked-files=no"]) {
        Some(s) if !s.trim().is_empty() => "-dirty",
        _ => "",
    };

    println!("cargo:rustc-env=SWARM_BUILD_SHA={sha}{dirty}");
}

/// Runs `git` in the crate dir, returning trimmed stdout on a clean exit.
/// `None` on any failure — missing binary, not a repo, non-zero status.
fn git(args: &[&str]) -> Option<String> {
    let out = Command::new("git")
        .args(args)
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    Some(String::from_utf8(out.stdout).ok()?.trim().to_string())
}
