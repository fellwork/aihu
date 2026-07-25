# Peer Channel — coordinating with OTHER concurrent sessions

This is not the storage substrate. `middleware.md` covers durable knowledge
(GBrain pages, `docs/` files) written for *later* readers. A **peer channel** is
live coordination between **concurrent, independent sessions** working the same
repo at the same time — sessions you do not own and cannot `SendMessage`.

**When you need one.** `SendMessage` reaches teammates *you* spawned. It cannot
reach an agent in another Claude Code session, another Conductor workspace, or on
another machine. The moment two sessions share a repo, they can:

- edit the same file and force one into a rebase,
- both "fix" the same defect,
- reset a checkout the other is mid-edit in,
- ship a change that silently invalidates the other's CI results.

A peer channel makes those collisions announced instead of discovered.

---

## The identity problem — read before you build one

Every messaging backend ties credentials to an *account*, not to an agent. The
naive setup gives every agent the same visible identity and the transcript
becomes unreadable.

**One shared bot + a per-message display-name override** is the right shape:
one credential, one install, N distinguishable senders, and it scales when a
third agent appears. (In Slack: one app, scope `chat:write.customize`, set
`username` per `chat.postMessage`.)

**Nothing about this is provisioned or enforced.** Creating an agent creates
nothing in the messaging system. An agent that is not TOLD its role posts under
the bot's default name; two agents can claim the same role and nothing objects;
an agent can change role mid-session. The convention holds by discipline only —
so it must be stated in the brief AND carried in the channel's own messages, not
kept in one Team Lead's head.

**Never post through a user-authenticated connector** (e.g. a claude.ai Slack
connector) when a bot token exists. Those post as the *human*, so every agent
looks like the same person.

---

## Inbound sensing — hooks, not Monitor

A background `Monitor` **cannot** poll an MCP-backed channel. MCP tools are
callable only by the model during a turn; `Monitor` runs bash. A monitor wired to
an MCP connector produces silence forever and reads exactly like "no messages."
(Observed. It cost a session.)

What works:

| Mechanism | Behaviour |
|---|---|
| **`Stop` hook, `asyncRewake: true`** | Runs when the agent finishes. Exits 2 with the message text → **wakes the model**. Real inbound sensing. |
| **`UserPromptSubmit` hook** | Injects new messages before the agent replies, so it never answers while stale. |
| `CronCreate` | Fires a prompt *into the session*, so MCP tools ARE available. Good fallback for long idle stretches. |

The poller needs a direct API credential (a bot token in the OS keychain), not
the MCP connector — the hook is a shell command.

**Two failure modes that make a channel silently useless:**

1. **Bot messages carry a subtype.** Filtering on "no subtype" drops every
   agent-posted message. The channel looks idle forever. Test with a real
   agent-posted message, never only a human one.
2. **A shared cursor starves a session.** If two sessions share one settings
   file, they share the hook — and a single cursor file means whichever polls
   first advances it and the other never sees the message. Key the cursor by the
   `session_id` on the hook's stdin.

**Fail loudly.** A channel that stops delivering must say so. Surface API errors
(`channel_not_found`, missing token) as a visible message. Silence must mean
"nothing was said," never "the pipe broke" — otherwise the channel degrades into
a false sense of coordination.

**Make the injected text self-describing.** Include the reply recipe and the
conventions in the message the hook injects. Context gets cleared and compacted;
a fresh agent must be able to answer correctly from the injection alone, without
memory, without this file.

---

## Threads, reactions, and the trap that comes with them

A flat channel becomes unreadable fast — coordination messages are long, and two
agents interleaving topics makes scrollback useless. Use the backend's threading:

- **One thread per topic** — per PR, per incident, per shared-surface change. The
  root states the topic; everything else replies into it. The channel stays a
  list of *topics*, not a firehose of paragraphs.
- **Reactions are the acknowledgement primitive.** 👀 = seen, ✅ = acted on. This
  is how you answer "did the peer get this?" without a heartbeat — which the
  protocol otherwise forbids. Cheap, unmissable, adds no message.

**⚠️ The trap: adopting threads can silently break inbound sensing.**
`conversations.history` (and its equivalents) returns thread **roots only** —
replies inside a thread are invisible to it. A poller written against history
alone will keep reporting "nothing new" while the entire conversation happens in
threads. That is the same class of failure as filtering out `bot_message`: the
channel looks idle, and silence is indistinguishable from working.

The poller must, for every root whose newest reply is past the cursor, also fetch
that thread's replies (`conversations.replies`) and merge them. **Tag each one
with its thread id in the injected text** — otherwise the agent reads a reply and
answers in a brand-new root, splitting the conversation it was trying to join.

Verify this the only way that counts: post a reply *inside a thread* as the peer
role and confirm the poller surfaces it. A test that only posts top-level messages
passes against a poller that can never see a thread.

## Channel protocol

- **Prefix every message with your track**: `[merge-train]`, `[docs-next]`.
  Also set the per-message display name to the same string.
- **State your blast radius** — the files and directories you own — and post
  *before* touching anything shared: the primary checkout, CI workflows, the
  compiler, generated/lockfile artifacts.
- **Flag cross-boundary changes before pushing**, not after. "This touches your
  area, tell me if it collides" costs one message and saves a rebase war.
- **Announce irreversible steps before and after** (a domain cutover, a publish),
  with the observable result — not "done", but the byte count, the HTTP status,
  the version that actually resolved.
- **No heartbeats.** Silence is the correct output for an idle check. A
  "nothing to report" every N minutes makes the transcript unreadable — and with
  a shared bot account, unattributable too.
- **Answer the direct question first.** These messages are expensive; a reply
  that resolves a blocking sequencing question is worth more than a status dump.

---

## Worked example — `aihu`

Channel `#aihu` (`C0BKR276YES`), one Slack app `agent-bridge`, bot token in the
macOS keychain as `SLACK_BOT_TOKEN`.

```
TOKEN=$(security find-generic-password -s SLACK_BOT_TOKEN -w)
curl -s -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode channel=C0BKR276YES \
  --data-urlencode username='merge-train' \
  --data-urlencode text='[merge-train] ...'
```

Receiving: `.claude/settings.local.json` (gitignored) wires `UserPromptSubmit` →
`~/.claude/slack-aihu-poll.py inject` and `Stop` → `... rewake` with
`asyncRewake: true`. Cursor at `~/.claude/.slack-aihu-cursor-<session_id>`.

**What it bought, in one session:** the peer applied two findings within minutes,
returned a strictly better version of one of them, and flagged a compiler change
in the other agent's area *before pushing it* — which produced a cross-check that
found three unswept call sites and a security-surface change (an SSR path moving
from client-only to server-emitted HTML) that neither session would have caught
alone.

---

## Anti-patterns

- Using the channel as durable storage. Findings that matter belong in a
  committed report or a promoted page; the channel is for coordination.
- Posting via a user connector when a bot token exists.
- Assuming the peer has inbound sensing. If it has not armed a hook, the channel
  is a noticeboard you write to — still useful, but do not wait on replies.
- Blocking on a reply. State your assumption, say you are proceeding on it, and
  invite a correction.
