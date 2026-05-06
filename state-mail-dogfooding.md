# State: mail dogfooding (track: framework defects surfaced by mail SPA)

**Status**: GREEN. Mail SPA functional at https://inbox.fellwork.com (round 4 verifier 5/5 PASS, 2026-05-06).

**Topic**: aihu framework defects surfaced by fellwork/mail SPA dogfooding.

**Active iterations**: closed at round 4 of 5 in compiler-emit-correctness class; closed at round 1 of 5 in router/compiler-protocol-coordination class.

**Releases shipped from this track**:
- `@aihu/app@0.1.1` + `@aihu/compiler@0.1.3` (`v0.2.3`) — round 1
- `@aihu/app@0.1.2` + `@aihu/compiler@0.1.4` (`v0.2.4`) — round 2
- `@aihu/compiler@0.1.5` (`v0.2.5`) — round 4

**Mail consumes**:
- `@aihu/app@^0.1.2`
- `@aihu/compiler@^0.1.5`
- `@aihu/router@^0.1.1`, `@aihu/runtime@^0.1.1`, `@aihu/signals@^0.1.1`, `@aihu/arbor@^0.1.1`, `@aihu/agent@^0.1.1`

**Live verification (2026-05-06, bundle `index-CYg_chQ3.js`)**: 9 routes, 0 uncaught JS errors.

| Route                | Status |
|----------------------|--------|
| `/` (index)          | PASS   |
| `/login`             | PASS   |
| `/inbox`             | PASS   |
| `/snoozed`           | PASS   |
| `/contacts`          | PASS   |
| `/calendar`          | PASS   |
| `/compose`           | PASS   |
| `/contact/:id`       | PASS   |
| `/thread/:id`        | PASS   |

**Defects closed**: A, B, C, D (see `docs/retro-mail-dogfooding-2026-05-06.md` for full notes).

- **A** — TDZ in compiled setup body (compiler emit ordering).
- **B** — reactive attr bindings emitted as raw values (compiler template lowering).
- **C** — stale `islands` artifact masking Round 1's fix (republish, no source change).
- **D** — `$prop` collection-form unconditionally `JSON.parse`s (compiler+mail authoring).

**Known follow-ups (not blocking)**:
- `$prop` declared with primitive type but reassigned in `$action` body still emits `const` → Rolldown rejection. Affects `examples/live-counter.aihu`; PR #108 open. Not a regression of Round 4; pre-existing v2 macro issue.
- Phantom stale-dist on initial publish (Round 2). Worth a CI assertion sanity check (e.g. post-build sentinel comparison between source and published `dist/`).

**Recent retros**: `docs/retro-mail-dogfooding-2026-05-06.md`.
