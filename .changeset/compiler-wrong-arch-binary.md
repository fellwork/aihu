---
"@aihu/compiler": patch
---

Stop shipping a host-arch `aihu-compile` binary inside the npm tarball, and
arch-validate any pre-existing binary before short-circuiting postinstall.

Two independent bugs colluded in `@aihu/compiler@0.5.0`: the `files` array in
`package.json` included `"bin"`, so whatever `bin/aihu-compile` the publisher's
machine had on disk (a Linux x86-64 ELF on the publishing host) got packed into
the tarball. Postinstall's idempotency check then saw `bin/aihu-compile` already
present and skipped the GitHub Releases download — without ever validating that
the on-disk binary matched the host arch. macOS arm64 consumers ran the Linux
ELF and got `spawnSync ... Unknown system error -8` (ENOEXEC) on every `.aihu`
file in their Vite dev server.

Fixes:
- `"bin"` removed from `files`. The tarball ships no binary; postinstall always
  populates `bin/aihu-compile<ext>` (the directory is created on demand).
- Postinstall now reads the first 20 bytes of any existing `bin/aihu-compile`
  or `target/release/aihu-compile`, identifies the file format (ELF / Mach-O /
  Mach-O FAT / PE) and arch (where cheaply available), and rejects mismatches —
  deleting `bin/aihu-compile` and falling through to the download path. Unknown
  formats (e.g. shell wrappers) are accepted to preserve exotic dev setups.
