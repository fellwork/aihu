#!/usr/bin/env python3
"""check_contrast.py — the verification tool `.tastemaker/style-lock.md` mandates.

WCAG 2.x relative-luminance contrast ratios over the aihu brand-contract token
set. The lock's rule is "re-run `check_contrast.py --matrix` with the new token,
don't eyeball it" — this is that tool. Zero dependencies; Python 3.8+.

Usage:
  ./check_contrast.py '#c8543a' '#faf8f4'      # one ad-hoc pair
  ./check_contrast.py --matrix                  # full matrix, light + dark
  ./check_contrast.py --matrix --mode light     # one mode
  ./check_contrast.py --matrix --against bg surface fg   # limit the columns
  ./check_contrast.py --pairings                # the lock's legal-pairings audit
                                                # (exits 1 if any claimed tier fails)

Tiers (the contract's own):
  text-safe   >= 4.5   body text, links, button labels on a fill
  ui-safe     >= 3.0   large/bold text, icons, state borders, button fills
  decorative  <  3.0   hairlines, never the sole state signal

TOKENS below mirror `.tastemaker/style-lock.md`'s color table. If the lock
changes, change TOKENS in the same commit — the lock is the source of truth.
"""

from __future__ import annotations

import argparse
import sys

# ── The contract token set (source of truth: .tastemaker/style-lock.md) ──────
# name -> {mode: hex}
TOKENS: dict[str, dict[str, str]] = {
    # Core brand rows
    "fg": {"light": "#1a1d24", "dark": "#ece9e2"},
    "bg": {"light": "#faf8f4", "dark": "#14161c"},
    "surface": {"light": "#ffffff", "dark": "#1a1d24"},
    "accent": {"light": "#c8543a", "dark": "#e0674b"},
    "graphite": {"light": "#363c47", "dark": "#aab0bd"},
    "border": {"light": "#ece9e2", "dark": "#2b3038"},
    "muted": {"light": "#5a5a55", "dark": "#a39a92"},
    # Component-token rows (packs.ts aihu-default) that differ from the above
    "pack-surface": {"light": "#faf8f4", "dark": "#1a1d24"},
    "pack-bg": {"light": "#faf8f4", "dark": "#13151b"},
    "destructive": {"light": "#a8432b", "dark": "#f08070"},
    "destructive-fg": {"light": "#faf8f4", "dark": "#1a1d24"},
    # Semantic state tokens (daihui layer, E1/E2 colour pass)
    "info": {"light": "#3d5a75", "dark": "#8fadc8"},
    "info-fg": {"light": "#faf8f4", "dark": "#14161c"},
    "success": {"light": "#3f6f4f", "dark": "#84b898"},
    "success-fg": {"light": "#faf8f4", "dark": "#14161c"},
    "warning": {"light": "#945f0e", "dark": "#d8a848"},
    "warning-fg": {"light": "#faf8f4", "dark": "#14161c"},
    "neutral": {"light": "#363c47", "dark": "#636a72"},
    "neutral-fg": {"light": "#faf8f4", "dark": "#faf8f4"},
}

DEFAULT_AGAINST = ["bg", "surface", "pack-surface", "fg"]

# The legal-pairings table from the lock, as (fg, bg, claimed-tier) triples.
# `--pairings` recomputes each and fails if a claim no longer holds.
CLAIMED_PAIRINGS: list[tuple[str, str, str, str]] = [
    # (token A, token B, mode, claimed tier)
    ("fg", "surface", "light", "text-safe"),
    ("fg", "bg", "light", "text-safe"),
    ("fg", "border", "light", "text-safe"),
    ("graphite", "surface", "light", "text-safe"),
    ("graphite", "bg", "light", "text-safe"),
    ("accent", "bg", "light", "ui-safe"),
    ("accent", "surface", "light", "ui-safe"),
    ("accent", "border", "light", "ui-safe"),
    ("fg", "accent", "light", "ui-safe"),
    ("accent", "graphite", "light", "decorative"),
    ("fg", "graphite", "light", "decorative"),
    # Semantic state tokens — light: fill legality + label-on-fill
    ("info", "bg", "light", "text-safe"),
    ("info", "surface", "light", "text-safe"),
    ("info-fg", "info", "light", "text-safe"),
    ("success", "bg", "light", "text-safe"),
    ("success", "surface", "light", "text-safe"),
    ("success-fg", "success", "light", "text-safe"),
    ("warning", "bg", "light", "text-safe"),
    ("warning", "surface", "light", "text-safe"),
    ("warning-fg", "warning", "light", "text-safe"),
    ("neutral", "bg", "light", "text-safe"),
    ("neutral-fg", "neutral", "light", "text-safe"),
    # Semantic state tokens — dark
    ("info", "bg", "dark", "text-safe"),
    ("info-fg", "info", "dark", "text-safe"),
    ("success", "bg", "dark", "text-safe"),
    ("success-fg", "success", "dark", "text-safe"),
    ("warning", "bg", "dark", "text-safe"),
    ("warning-fg", "warning", "dark", "text-safe"),
    ("neutral", "bg", "dark", "ui-safe"),
    ("neutral-fg", "neutral", "dark", "text-safe"),
]


def parse_hex(value: str) -> tuple[float, float, float]:
    v = value.strip().lstrip("#")
    if len(v) == 3:
        v = "".join(c * 2 for c in v)
    if len(v) != 6:
        raise ValueError(f"not a hex colour: {value!r}")
    return tuple(int(v[i : i + 2], 16) / 255.0 for i in (0, 2, 4))  # type: ignore[return-value]


def channel_lin(c: float) -> float:
    # WCAG 2.x sRGB linearization
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def relative_luminance(hex_colour: str) -> float:
    r, g, b = (channel_lin(c) for c in parse_hex(hex_colour))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: str, b: str) -> float:
    la, lb = relative_luminance(a), relative_luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def tier(ratio: float) -> str:
    if ratio >= 4.5:
        return "text-safe"
    if ratio >= 3.0:
        return "ui-safe"
    return "decorative"


TIER_ORDER = {"decorative": 0, "ui-safe": 1, "text-safe": 2}


def resolve(name_or_hex: str, mode: str) -> tuple[str, str]:
    """Return (label, hex). Accepts a token name or a literal hex."""
    if name_or_hex in TOKENS:
        return name_or_hex, TOKENS[name_or_hex][mode]
    if name_or_hex.lstrip("#") and all(
        c in "0123456789abcdefABCDEF" for c in name_or_hex.lstrip("#")
    ):
        return name_or_hex, name_or_hex
    raise SystemExit(
        f"unknown token {name_or_hex!r} — known: {', '.join(TOKENS)} (or pass a hex)"
    )


def print_matrix(mode: str, against: list[str]) -> None:
    cols = [(a, TOKENS[a][mode]) for a in against]
    rows = [(n, v[mode]) for n, v in TOKENS.items()]
    name_w = max(len(n) for n, _ in rows) + 2
    print(f"\n=== {mode} ===")
    header = " " * name_w + "".join(f"{c[0]:>14}" for c in cols)
    print(header)
    print(" " * name_w + "".join(f"{c[1]:>14}" for c in cols))
    for rname, rhex in rows:
        cells = []
        for _cname, chex in cols:
            if rhex.lower() == chex.lower():
                cells.append(f"{'—':>14}")
                continue
            r = contrast(rhex, chex)
            mark = {"text-safe": "T", "ui-safe": "U", "decorative": "d"}[tier(r)]
            cells.append(f"{r:>11.2f} {mark}")
        print(f"{rname:<{name_w}}" + "".join(cells))
    print("\n  T = text-safe (>=4.5)   U = ui-safe (>=3.0)   d = decorative (<3.0)")


def run_pairings() -> int:
    failures = 0
    for a, b, mode, claimed in CLAIMED_PAIRINGS:
        r = contrast(TOKENS[a][mode], TOKENS[b][mode])
        actual = tier(r)
        ok = TIER_ORDER[actual] >= TIER_ORDER[claimed]
        status = "ok  " if ok else "FAIL"
        print(f"  {status} [{mode:>5}] {a} / {b}: {r:.2f} -> {actual} (claimed {claimed})")
        if not ok:
            failures += 1
    if failures:
        print(f"\n{failures} claimed pairing(s) no longer hold. Fix the token or the claim.")
        return 1
    print("\nAll claimed pairings hold.")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("colours", nargs="*", help="two token names or hex values for a single pair")
    p.add_argument("--matrix", action="store_true", help="print the full token matrix")
    p.add_argument("--pairings", action="store_true", help="verify the lock's legal-pairings claims")
    p.add_argument("--mode", choices=["light", "dark", "both"], default="both")
    p.add_argument("--against", nargs="+", default=DEFAULT_AGAINST, metavar="TOKEN",
                   help=f"matrix columns (default: {' '.join(DEFAULT_AGAINST)})")
    args = p.parse_args()

    modes = ["light", "dark"] if args.mode == "both" else [args.mode]

    if args.pairings:
        return run_pairings()

    if args.matrix:
        for a in args.against:
            if a not in TOKENS:
                raise SystemExit(f"unknown token {a!r} for --against")
        for mode in modes:
            print_matrix(mode, args.against)
        return 0

    if len(args.colours) == 2:
        for mode in modes:
            la, ha = resolve(args.colours[0], mode)
            lb, hb = resolve(args.colours[1], mode)
            r = contrast(ha, hb)
            print(f"[{mode:>5}] {la} ({ha}) vs {lb} ({hb}): {r:.2f} -> {tier(r)}")
        return 0

    p.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())
