---
"@aihu/cli": patch
---

Fix mojibake in `package.json` description: `â€"` → `—` (em dash). The
character was double-encoded somewhere in the original write; npm shows the
mangled string on the package page. Doc-only.

(This bump also serves as the verification release for npm OIDC trusted
publishing — the previous smoke shipped before `NPM_PROVENANCE=1` was in repo
variables, so its tarball lacks attestations.)
