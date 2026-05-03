# T5 — CI re-enable follow-up

After this PR lands: enable Branch Protection on `main` requiring `plan-a.yml`
to pass before merge. Repo Settings -> Branches -> Branch protection rules ->
main -> Require status checks to pass. NOT a code change — user manual action.

## Context

Track T5 of the 6-track follow-up session (2026-05-03) verified that
`.github/workflows/plan-a.yml` already has `push` and `pull_request` triggers
on `main` (re-enabled in Plan 7.1 at v1 cutover). No YAML edit was needed —
the deliverable was already in place.

The remaining work — gating merges on a green `plan-a.yml` run — is a
GitHub repo-settings change, not an in-repo change, and must be performed
by the user via the web UI.
