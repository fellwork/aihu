# tracker-cache

A local SQLite mirror of this repo's GitHub issues, GitHub PRs (with check
status), and Linear tasks — so routine lookups are a local file read instead
of a `gh`/Linear API call or an MCP round-trip.

Linear is filtered to the `aihu` project only (FEL also tracks `data`/`web`
for other repos) and to non-completed/non-canceled issues — this cache is
for "what's still active," not a full historical mirror.

```
scripts/tracker-cache/
  schema.sql   table definitions
  db.ts        shared SQLite handle (opens/creates .cache/tracker.db)
  linear.ts    minimal read-only Linear GraphQL client (keychain token)
  sync.ts      the poller — fetches all three sources, upserts
  query.ts     read-only CLI over the cache
```

The DB file lives at `.cache/tracker.db` (gitignored — it's a mirror, not
source of truth, and every fetched field is public repo/task metadata, no
secrets).

## One-time setup

Requires `gh` authenticated (`gh auth status`) and a Linear API key in the
macOS keychain:

```bash
security add-generic-password -s LINEAR_API_KEY -a "$USER" -w   # prompts; no echo
```

## Usage

```bash
bun run tracker:sync                          # refresh the cache (all 3 sources)
bun run tracker:query status                  # last-synced time + row counts per source
bun run tracker:query issues --state open
bun run tracker:query issues --label bug
bun run tracker:query prs --state open --failing
bun run tracker:query linear --project aihu
bun run tracker:query show-issue 427
bun run tracker:query show-pr 706
```

**Always check `status` before trusting a query** — a source can go stale
(auth expired, API down) while the other two stay fresh; `sync.ts` records
each source's outcome independently in `sync_log`, and `query.ts` prints it
after every `issues`/`prs` call for exactly that reason.

Direct SQL also works: `sqlite3 .cache/tracker.db "select * from github_prs where state='OPEN'"`.

## Keeping it fresh — launchd (macOS)

`sync.ts` does nothing on its own; something has to call it periodically.
The following runs it every 15 minutes via a user LaunchAgent (adjust
`StartInterval` — seconds — to taste):

```bash
cat > ~/Library/LaunchAgents/com.aihu.tracker-cache.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.aihu.tracker-cache</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>cd /Users/smcguirt/conductor/repos/aihu && $(command -v bun) scripts/tracker-cache/sync.ts >> .cache/sync.log 2>&1</string>
  </array>
  <key>StartInterval</key><integer>900</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardErrorPath</key><string>/tmp/aihu-tracker-cache.err.log</string>
</dict>
</plist>
EOF
launchctl load ~/Library/LaunchAgents/com.aihu.tracker-cache.plist
```

To stop it: `launchctl unload ~/Library/LaunchAgents/com.aihu.tracker-cache.plist`.

This is scoped to one machine and one checkout path (the `cd` above is
absolute) — if you clone the repo elsewhere, edit the plist's path or just
run `bun run tracker:sync` by hand/on a cron of your own choosing. Nothing
else in the repo depends on the cache existing; `query.ts` tells you plainly
to run `sync.ts` if `.cache/tracker.db` isn't there yet.

## Why not the `swarm` skill's Linear client

`.claude/skills/swarm/` talks to the same Linear team but is a coordination
system (roles, claims, ownership) built for agent-to-agent handoff — this is
a plain, read-only data mirror with no role concept. Deliberately kept
independent so dropping one doesn't require touching the other.
