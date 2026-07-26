#!/usr/bin/env python3
"""check_palette_parity.py — does the palette that SHIPS match the brand contract?

FEL-435. `check_contrast.py` audits `.tastemaker/style-lock.md`, faithfully: 27
of its 30 lock-derived values were exact transcriptions. What nothing audited
was `packages/css-engine/src/packs.ts` — the palette a user actually receives.
Both artefacts were internally consistent and no gate compared them.

The cost of that gap, concretely: `accent`/`border` reports 3.62 against the
lock (+0.62 over the 3.0 ui-safe floor) and is 3.12 in the shipped pack (+0.12).
The tool was right about the contract and silent about the product.

WHAT THIS DOES NOT DO. It does not decide which artefact wins. That is a brand
decision, escalated. Resolving it by rewriting one side — which is what
"just derive the hexes from packs.ts" amounts to — would settle it by fiat, in
a file whose own header names the lock as the source of truth.

FAILS WHEN:
  - a divergence exists that is not in palette-divergence.json   (new drift)
  - a listed divergence no longer diverges                       (stale entry)

Known divergences are PRINTED as DEBT on every run, never silent. Green today,
loud on change in either direction — deliberately not a permanently-red gate,
because those get disabled.

Exit 0 = parity as recorded. Exit 1 = the record and reality disagree.

Usage:  ./check_palette_parity.py [--verbose]
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCK = ROOT / ".tastemaker" / "style-lock.md"
PACKS = ROOT / "packages" / "css-engine" / "src" / "packs.ts"
EXCEPTIONS = ROOT / ".tastemaker" / "palette-divergence.json"

# Brand-contract token -> the packs.ts key that is the SAME token, not merely a
# related one. `--graphite` is deliberately absent: `--color-neutral` is its own
# token in the lock (line 70) and packs matches that line exactly. Pairing them
# compares a brand ink against a component fill — wrong in dark, and invisible
# in light because there the two coincide.
TOKEN_MAP: dict[str, str] = {
    "fg": "color-foreground",
    "bg": "color-background",
    "surface": "color-surface",
    "accent": "color-accent",
    "border": "color-border",
    "muted": "color-muted",
    # The state rows are declared as `--color-*` in the lock too, so lock name
    # and pack key coincide here. Spelling them out rather than special-casing:
    # this table is the whole trust surface and it should be readable as data.
    "color-info": "color-info",
    "color-success": "color-success",
    "color-warning": "color-warning",
    "color-neutral": "color-neutral",
}

# A parse that silently matches nothing must not read as parity. These floors
# are the same idea as the sample gate's: "found 0" is a broken instrument, not
# a clean bill of health.
MIN_LOCK_TOKENS = 7
MIN_PACK_COLORS = 20


def die(msg: str) -> None:
    print(f"check:palette-parity — {msg}", file=sys.stderr)
    raise SystemExit(1)


def parse_lock() -> dict[str, dict[str, str]]:
    """`| Label | `--name` | `#light` | `#dark` | …` rows from the lock's tables."""
    text = LOCK.read_text()
    out: dict[str, dict[str, str]] = {}
    for m in re.finditer(
        r"\|[^|\n]*\|\s*`--([\w-]+)`\s*\|\s*`(#[0-9a-fA-F]{6})`\s*\|\s*`(#[0-9a-fA-F]{6})`\s*\|",
        text.replace("**", ""),
    ):
        out[m.group(1)] = {"light": m.group(2), "dark": m.group(3)}
    if len(out) < MIN_LOCK_TOKENS:
        die(
            f"parsed only {len(out)} tokens from {LOCK.name} (expected >= {MIN_LOCK_TOKENS}). "
            "The table format probably changed — fix the parser rather than trusting this run."
        )
    return out


def parse_packs() -> tuple[dict[str, str], dict[str, str]]:
    """`aihuDefault`'s `tokens:` (light) and `dark:` maps."""
    text = PACKS.read_text()
    try:
        blk = text[text.index("export const aihuDefault") :]
        blk = blk[: blk.index("\n})")]
    except ValueError:
        die(f"could not locate the aihuDefault block in {PACKS.name}")

    def section(marker: str) -> dict[str, str]:
        i = blk.index(marker)
        j = blk.index("\n  }", i)
        return dict(re.findall(r"'([\w-]+)':\s*'([^']*)'", blk[i:j]))

    light, dark = section("tokens: {"), section("dark: {")
    colors = [k for k in light if k.startswith("color-")]
    if len(colors) < MIN_PACK_COLORS:
        die(
            f"parsed only {len(colors)} color-* tokens from {PACKS.name} "
            f"(expected >= {MIN_PACK_COLORS}). Fix the parser rather than trusting this run."
        )
    return light, dark


def main() -> int:
    verbose = "--verbose" in sys.argv
    lock = parse_lock()
    plight, pdark = parse_packs()
    known = json.loads(EXCEPTIONS.read_text())["divergences"]
    known_by_key = {(d["token"], d["mode"]): d for d in known}

    actual: dict[tuple[str, str], tuple[str, str]] = {}
    missing: list[str] = []

    for token, pack_key in TOKEN_MAP.items():
        if token not in lock:
            missing.append(f"{token!r} is in TOKEN_MAP but not in {LOCK.name}")
            continue
        for mode, pmap in (("light", plight), ("dark", pdark)):
            if pack_key not in pmap:
                missing.append(f"{pack_key!r} ({mode}) is in TOKEN_MAP but not in {PACKS.name}")
                continue
            lv, pv = lock[token][mode].lower(), pmap[pack_key].lower()
            if lv != pv:
                actual[(token, mode)] = (lv, pv)

    if missing:
        for m in missing:
            print(f"  ✗ {m}", file=sys.stderr)
        die(f"{len(missing)} mapping entr(ies) resolve to nothing — a map with a hole is not a map.")

    checked = len(TOKEN_MAP) * 2
    new = sorted(set(actual) - set(known_by_key))
    stale = sorted(set(known_by_key) - set(actual))

    if known:
        print(f"DEBT — {len(known)} recorded lock↔packs divergence(s), escalated, not settled:")
        for d in known:
            print(f"  · {d['token']:<9} {d['mode']:<6} lock {d['lock']}  packs {d['packs']}")
            if verbose:
                print(f"      {d['reason']}")

    if verbose:
        agree = checked - len(actual)
        print(f"\n{agree}/{checked} values agree; {len(actual)} diverge.")

    if new or stale:
        print()
        for token, mode in new:
            lv, pv = actual[(token, mode)]
            print(
                f"  ✗ NEW divergence: {token} ({mode}) — lock {lv}, packs {pv}. "
                f"Reconcile the two, or record it in {EXCEPTIONS.name} with a reason.",
                file=sys.stderr,
            )
        for token, mode in stale:
            d = known_by_key[(token, mode)]
            print(
                f"  ✗ STALE exception: {token} ({mode}) is recorded as diverging "
                f"(lock {d['lock']} vs packs {d['packs']}) but the two now AGREE. "
                f"Delete the entry — a debt list that outlives its debt stops being read.",
                file=sys.stderr,
            )
        die(f"{len(new)} new divergence(s), {len(stale)} stale exception(s).")

    print(f"\ncheck:palette-parity — {checked} values compared, divergences exactly as recorded.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
