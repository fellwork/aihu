#!/usr/bin/env bash
#
# check-lesson-refs.sh — a cited lesson must be REACHABLE, not merely written.
#
# WHY THIS EXISTS
#   On 2026-07-26 three lesson documents were written, committed, and cited by
#   path in two Notion pages and an orchestrator brief — with correct, verified
#   instance counts attached. They were not on `main`. Every citation resolved to
#   nothing for anyone who was not standing in one specific worktree, and nothing
#   errored: "committed" had been rendered as "on main."
#
#   That is instance 28 in docs/lessons/absent-value-rendered-as-real.md, and the
#   document it happened to is the one that names the pattern.
#
#   `git commit` is not `git push` is not `on main`. This script asks the only
#   question that distinguishes them, and nothing else in this repo asks it.
#
# WHAT IT CHECKS
#   Every docs/lessons/<name>.md path cited anywhere under docs/ must exist in
#   the tree being checked. Citations come in two forms and both are resolved:
#     - absolute-ish:  docs/lessons/foo.md          (from docs/state/*.md, plans, etc.)
#     - relative link: [text](foo.md)               (from inside docs/lessons/)
#
# TWO MODES, because there are two different questions and they fail differently
#
#   default — base = HEAD, "will every citation resolve once this lands?"
#     This is the CI gate. It must be HEAD-based: a PR that ADDS a lesson and
#     cites it would be permanently red against origin/main, which is a gate that
#     cannot go green — the same "cannot fail / cannot pass" defect class this
#     repo keeps producing. Catches citations of files that exist nowhere
#     (instance 29: a lesson declared "now promoted" that was never written).
#
#   LESSON_REFS_BASE=origin/main — "is it reachable from main RIGHT NOW?"
#     The publication check. Run it before telling anyone a lesson exists, and
#     before a doc outside this repo (Notion, a brief, an issue) cites a repo
#     path. Catches instance 28: committed, cited by path, not on main.
#
#   Committed is not pushed; pushed is not merged. The default mode cannot see
#   that distinction — that is what the origin/main mode is for.
#
# EXIT
#   0  every cited lesson exists in the base tree
#   1  at least one cited lesson is missing from it
#   2  could not resolve the base ref (not a git repo / fetch failed)
#
set -uo pipefail

REF="${LESSON_REFS_BASE:-HEAD}"

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "check-lesson-refs: not inside a git repository" >&2
  exit 2
}

# Refresh only when comparing against a remote ref. A stale origin/main would make
# this script lie in the reassuring direction — the exact failure it exists to catch.
case "$REF" in
  origin/*) git fetch --quiet origin "${REF#origin/}" 2>/dev/null || true ;;
esac

if ! git rev-parse --verify --quiet "$REF" >/dev/null; then
  echo "check-lesson-refs: cannot resolve '$REF' — fetch it first" >&2
  exit 2
fi

# The set of lesson files actually reachable from the base ref.
reachable="$(git ls-tree -r --name-only "$REF" -- docs/lessons/ || true)"

# ---- collect citations -------------------------------------------------------
# Scanning the WORKING TREE on purpose: the question is whether what we are about
# to publish points at something a reader can reach, not whether the base ref is
# self-consistent.
cited="$(
  {
    # form 1 — any docs/lessons/<name>.md mentioned anywhere under docs/
    grep -rhoE 'docs/lessons/[A-Za-z0-9._-]+\.md' docs/ 2>/dev/null

    # form 2 — relative markdown links between files inside docs/lessons/
    if [ -d docs/lessons ]; then
      grep -rhoE '\]\([A-Za-z0-9._-]+\.md\)' docs/lessons/ 2>/dev/null \
        | sed -E 's/^\]\(//; s/\)$//; s#^#docs/lessons/#'
    fi
  } | sort -u
)"

if [ -z "$cited" ]; then
  echo "check-lesson-refs: no lesson citations found under docs/ — nothing to verify"
  exit 0
fi

# ---- exemptions --------------------------------------------------------------
# Knowingly-dangling citations (prose ABOUT a broken citation). Never silent:
# every applied exemption is printed, so it reads as debt, not as a pass.
EXEMPT_FILE="scripts/check-lesson-refs.exempt"
exempt_paths=""
if [ -f "$EXEMPT_FILE" ]; then
  exempt_paths="$(grep -vE '^\s*(#|$)' "$EXEMPT_FILE" | awk '{print $1}')"
fi

# ---- compare -----------------------------------------------------------------
missing=""
exempted=""
checked=0
while IFS= read -r path; do
  [ -n "$path" ] || continue
  checked=$((checked + 1))
  if printf '%s\n' "$reachable" | grep -Fxq "$path"; then
    continue
  fi
  if [ -n "$exempt_paths" ] && printf '%s\n' "$exempt_paths" | grep -Fxq "$path"; then
    exempted="${exempted}${path}"$'\n'
    continue
  fi
  missing="${missing}${path}"$'\n'
done <<< "$cited"

if [ -n "$exempted" ]; then
  echo "check-lesson-refs: ${REF} — knowingly-dangling citations, exempted (this is DEBT, not a pass):"
  printf '%s' "$exempted" | while IFS= read -r p; do
    [ -n "$p" ] || continue
    reason="$(grep -F "$p" "$EXEMPT_FILE" | head -1 | sed -E "s#^[^[:space:]]+[[:space:]]+##")"
    echo "  ~ $p"
    echo "      ${reason}" | cut -c1-160
  done
fi

if [ -n "$missing" ]; then
  echo "check-lesson-refs: FAIL — lesson(s) cited under docs/ but NOT reachable from ${REF}:" >&2
  printf '%s' "$missing" | while IFS= read -r p; do
    [ -n "$p" ] || continue
    if git cat-file -e "HEAD:$p" 2>/dev/null; then
      echo "  MISSING FROM ${REF} (committed on this branch, not yet landed): $p" >&2
    elif [ -f "$p" ]; then
      echo "  MISSING FROM ${REF} (in the worktree, NOT COMMITTED):           $p" >&2
    else
      echo "  MISSING FROM ${REF} (does not exist anywhere — dangling):       $p" >&2
    fi
    # name who is making the unreachable promise
    grep -rlE "docs/lessons/$(basename "$p")|\]\($(basename "$p")\)" docs/ 2>/dev/null \
      | sed 's/^/      cited by: /' >&2
  done
  echo "" >&2
  echo "  Committed is not pushed; pushed is not merged. Land these before citing them." >&2
  if [ "$REF" = "HEAD" ]; then
    echo "  (This was the HEAD gate. For 'is it on main yet?' run:" >&2
    echo "     LESSON_REFS_BASE=origin/main bash scripts/check-lesson-refs.sh)" >&2
  fi
  exit 1
fi

echo "check-lesson-refs: OK — ${checked} cited lesson(s), all reachable from ${REF}"
exit 0
