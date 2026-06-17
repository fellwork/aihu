---
"@aihu/cli": minor
"@aihu/agent-server": minor
---

add `create-aihu --template agent` + publish `@aihu/agent-server`

- **New opt-in `agent` template** (`create-aihu --template agent`, or option 4 in the
  wizard): the headline aihu thesis made runnable. A durable on-screen `<task-list>`
  Web Component that BOTH a human and an external AI agent drive — the agent reaches the
  same visible instance over `@aihu/agent-server`'s capability bridge (server = policy
  gate, browser = sole executor). Two-process app (Bun bridge server + Vite, client-target
  compiler). Verified end-to-end: typing in the input AND an external
  `curl /agent/call` both append to the same live instance; unexposed actions are rejected.
- **`@aihu/agent-server` first publish** (added to the release allowlist). Includes the
  fix that lets `createAgentServer`'s `node` mount path stand up its own server-side DOM
  internally (no consumer jsdom/`createHost` glue) when the runtime has no `document`.

The bridge in the template is unauthenticated (local dev/demo); the generated server
warns against exposing it to untrusted networks.
