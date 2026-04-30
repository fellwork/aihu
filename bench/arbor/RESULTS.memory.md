# `@scribe/arbor` Memory Results

**Generated:** 2026-04-30
**Runner:** --expose-gc · Bun 1.3.8
**Note:** buildHeapDelta = heap growth per context build. disposeResidual = residual after cleanup.

---

> Memory numbers are indicative only under Bun/V8. GC timing variance can affect
> residuals significantly. Focus on buildHeapDelta orders of magnitude, not exact bytes.

## Workload: `mount-10k-leaves` (N=10)

*Mount 10k static text leaves under a fragment and dispose. One mount+dispose = 1 op.*

| Competitor | buildHeapDelta/ctx | disposeResidual | n |
| --- | ---: | ---: | ---: |
| @scribe/arbor | 0 B | 0 B | 10 |
| lit-html | 0 B | 0 B | 10 |
| solid-js | 4.21 MB | 42.08 MB | 10 |
| @vue/runtime-dom | 0 B | 0 B | 10 |
| preact | 0 B | 0 B | 10 |
| vanilla | 0 B | 0 B | 10 |

## Workload: `mount-deep-100x10` (N=10)

*Mount a depth-100 spine (10 leaf siblings per level) and dispose. One mount+dispose = 1 op.*

| Competitor | buildHeapDelta/ctx | disposeResidual | n |
| --- | ---: | ---: | ---: |
| @scribe/arbor | 0 B | 0 B | 10 |
| lit-html | 0 B | 0 B | 10 |
| solid-js | 0 B | 0 B | 10 |
| @vue/runtime-dom | 0 B | 0 B | 10 |
| preact | 0 B | 0 B | 10 |
| vanilla | 0 B | 0 B | 10 |

## Workload: `mount-wide-1000` (N=100)

*Mount 1000 sibling branches each with 1 reactive text leaf and dispose. One mount+dispose = 1 op.*

| Competitor | buildHeapDelta/ctx | disposeResidual | n |
| --- | ---: | ---: | ---: |
| @scribe/arbor | 0 B | 0 B | 100 |
| lit-html | 0 B | 0 B | 100 |
| solid-js | 0 B | 0 B | 100 |
| @vue/runtime-dom | 0 B | 0 B | 100 |
| preact | 8.2 KB | 824.6 KB | 100 |
| vanilla | 0 B | 0 B | 100 |

## Workload: `update-1-of-10k-leaves` (N=1)

*Mount 10k-leaf tree once, then write the signal for leaf[0] on each op. One signal write = 1 op.*

| Competitor | buildHeapDelta/ctx | disposeResidual | n |
| --- | ---: | ---: | ---: |
| @scribe/arbor | -31.12 MB | -31.12 MB | 1 |
| lit-html | 38.62 MB | 38.62 MB | 1 |
| solid-js | ERROR | `Client-only API called on the server side. Run client-only c` | — |
| @vue/runtime-dom | ERROR | `SVGElement is not defined` | — |
| preact | -25.40 MB | -25.40 MB | 1 |
| vanilla | -5.23 MB | -5.23 MB | 1 |

## Workload: `attr-thrash-100x100` (N=10)

*100 elements × 100 reactive attrs each. Write all 10k signals once per op.*

| Competitor | buildHeapDelta/ctx | disposeResidual | n |
| --- | ---: | ---: | ---: |
| @scribe/arbor | 5.82 MB | 58.24 MB | 10 |
| lit-html | ERROR | `Attempted to assign to readonly property.` | — |
| solid-js | ERROR | `Client-only API called on the server side. Run client-only c` | — |
| @vue/runtime-dom | ERROR | `SVGElement is not defined` | — |
| preact | 1.29 MB | 12.90 MB | 10 |
| vanilla | -951.9 KB | -9.30 MB | 10 |

## Workload: `krausest-1k-cycle` (N=10)

*Create 1000 rows, partial-update every 10th, clear. Three-phase timed as one op. JSDOM-relative.*

| Competitor | buildHeapDelta/ctx | disposeResidual | n |
| --- | ---: | ---: | ---: |
| @scribe/arbor | 0 B | 0 B | 10 |
| lit-html | 0 B | 0 B | 10 |
| solid-js | 0 B | 0 B | 10 |
| @vue/runtime-dom | 0 B | 0 B | 10 |
| preact | 0 B | 0 B | 10 |
| vanilla | 0 B | 0 B | 10 |
