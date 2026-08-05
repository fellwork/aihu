---
'@aihu-plugin/agent-readiness': minor
'@aihu/server': minor
---

llms.txt: support prose, not just link lists.

`LlmsTxtSection` gains `body` (free markdown under the heading, before the
links) and `LlmsTxtConfig` gains `intro` (prose after the `>` summary, before
the first section). `links` becomes optional, so a section can be prose-only.
Both surface on `AgentReadinessConfig` as `llmsSections[].body` and
`llmsIntro`, and thread through `createAgentReadinessRoutes` into both
`/llms.txt` and `/llms-full.txt`.

**Why.** A section was previously a title plus a list of links and nothing
else. That is enough for a docs site whose llms.txt is a table of contents,
and not enough for a site whose llms.txt has to TEACH an agent something
before the links mean anything — a wire protocol and its transport, a REST
route table, the grammar for addressing content. Those are paragraphs and
non-link bullets. fellwork.com needs all three and had to hand-roll its entire
document instead, which is how a canonical format ends up with one dialect per
consumer.

`body` and `intro` are emitted verbatim and unescaped — markdown going into a
markdown document. They are authored content, never interpolated input.

**No behaviour change for existing configs.** A section with neither `body`
nor `links` is still omitted; the guard widened from "no links" to "nothing to
say". Link-only configs render byte-for-byte as before — asserted by a strict
equality test, and verified end-to-end by regenerating `apps/docs`' llms.txt
and diffing it against what aihu.dev serves today: identical, 1428 bytes.
