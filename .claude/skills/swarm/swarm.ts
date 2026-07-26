#!/usr/bin/env bun
/**
 * swarm.ts — the agent swarm's shared consciousness.
 *
 * WHY THIS EXISTS
 * ---------------
 * Swarm state used to live in the git repo. Git is BRANCH-SCOPED, so it cannot
 * hold shared state: `docs/TOPOLOGY.md` was committed specifically so it would
 * "survive a cleared context and reach another agent's checkout", and it did
 * neither — it sat on one unmerged branch while every agent briefed to read it
 * from a main-cut worktree got ENOENT. A record that reads as present while
 * being absent at the point of use is this project's signature defect.
 *
 * So durable state lives OUTSIDE git, reachable from any worktree, any branch,
 * any machine, any cleared context:
 *
 *   Notion  — scratchpad + wiki. Narrative: findings, decisions, topology,
 *             retros. The "what we know" layer.
 *   Linear  — tasks, synced to the projects listed in Notion. Ownership and
 *             status. The "who is doing what" layer.
 *
 * NO MCP. MCP servers are per-session and OAuth-gated; they are unavailable to
 * subagents, to cron runs, and to headless cloud sandboxes — precisely the
 * contexts a swarm memory must survive. This talks to both REST APIs directly.
 *
 * FAIL LOUDLY. Every API error is surfaced, never swallowed. A memory layer
 * that quietly returns nothing is worse than none at all: the agent cannot
 * distinguish "no results" from "broken", so it improvises and nobody finds
 * out. That is the same class as a bench row published as `28.63 ns` from a
 * dead binding.
 *
 * Tokens are read from the macOS keychain at call time and never printed,
 * never passed via argv, never written to disk.
 *
 * Usage:  bun .claude/skills/swarm/swarm.ts <command> [...]
 *         (run `whoami` first — it health-checks both backends)
 */

const LINEAR_API = 'https://api.linear.app/graphql'
const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

const TEAM_KEY = 'FEL'
/** Linear projects that mirror the Notion project list. */
const PROJECTS = ['aihu', 'data', 'web'] as const

/** Roles the swarm recognises. Must match ~/.claude/slack-aihu-poll.py. */
const KNOWN_ROLES = new Set([
  'orchestrator',
  'verifier',
  'architect',
  'historian',
  'builder',
  'builder-a',
  'builder-b',
  'investigator',
])

// ── credentials ──────────────────────────────────────────────────────────────

/** Read a secret from the macOS keychain. Returns '' when absent. */
function keychain(service: string): string {
  try {
    const p = Bun.spawnSync(['security', 'find-generic-password', '-s', service, '-w'])
    return p.success ? new TextDecoder().decode(p.stdout).trim() : ''
  } catch {
    return ''
  }
}

// ── identity ─────────────────────────────────────────────────────────────────

/**
 * Resolve this agent's role: env, else a `.agent-role` file in cwd or any
 * ancestor. Refuses anything not in KNOWN_ROLES rather than guessing — an
 * agent that silently adopts another's identity attributes its writes to the
 * wrong role, which corrupts the shared record for everyone.
 *
 * Conductor auto-names workspaces after cities (`almaty`, `sarajevo`), so the
 * directory name carries no role information and must not be used.
 */
function resolveRole(): string {
  const env = (process.env.AIHU_SLACK_ROLE ?? '').trim()
  if (env) return KNOWN_ROLES.has(env) ? env : ''
  let d = process.cwd()
  for (let i = 0; i < 8; i++) {
    const f = Bun.file(`${d}/.agent-role`)
    try {
      if (f.size > 0) {
        const cand = require('node:fs').readFileSync(`${d}/.agent-role`, 'utf8').trim()
        return KNOWN_ROLES.has(cand) ? cand : ''
      }
    } catch {
      /* keep walking */
    }
    const parent = require('node:path').dirname(d)
    if (parent === d) break
    d = parent
  }
  return ''
}

const ROLE = resolveRole()

function requireRole(): string {
  if (!ROLE) {
    die(
      'agent role is unset, so this write cannot be attributed.\n' +
        '  Fix (one command, in your worktree root):\n' +
        '      echo <role> > .agent-role\n' +
        `  Valid roles: ${[...KNOWN_ROLES].sort().join(', ')}`,
    )
  }
  return ROLE
}

function die(msg: string): never {
  console.error(`swarm: ${msg}`)
  process.exit(1)
}

// ── Linear ───────────────────────────────────────────────────────────────────

async function linear<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const key = keychain('LINEAR_API_KEY')
  if (!key) {
    die(
      'LINEAR_API_KEY not in keychain — the task layer is OFF, not empty.\n' +
        '  Fix: security add-generic-password -s LINEAR_API_KEY -a "$USER" -w',
    )
  }
  let res: Response
  try {
    res = await fetch(LINEAR_API, {
      method: 'POST',
      headers: { Authorization: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
  } catch (e) {
    die(`Linear unreachable (${(e as Error).name}) — task layer DEGRADED, not idle.`)
  }
  if (!res.ok) die(`Linear HTTP ${res.status} ${res.statusText} — task layer BROKEN.`)
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] }
  if (body.errors?.length) {
    die(`Linear API error: ${body.errors.map((e) => e.message).join('; ')}`)
  }
  if (!body.data) die('Linear returned no data and no error — refusing to treat as empty.')
  return body.data
}

// ── Notion ───────────────────────────────────────────────────────────────────

function notionToken(): string {
  return keychain('NOTION_TOKEN') || keychain('NOTION_API_KEY')
}

async function notion<T = any>(path: string, init?: RequestInit): Promise<T> {
  const tok = notionToken()
  if (!tok) {
    die(
      'NOTION_TOKEN not in keychain — the wiki layer is OFF, not empty.\n' +
        '  Setup:\n' +
        '    1. https://www.notion.so/profile/integrations -> New integration\n' +
        '       (internal, capabilities: read + update + insert content)\n' +
        '    2. Copy the Internal Integration Secret (starts ntn_)\n' +
        '    3. security add-generic-password -s NOTION_TOKEN -a "$USER" -w\n' +
        '    4. In Notion, open the swarm root page -> ... -> Connections ->\n' +
        '       add your integration. WITHOUT THIS STEP the API returns an\n' +
        '       empty search with HTTP 200 — a real result that means nothing.\n' +
        '    5. bun .claude/skills/swarm/swarm.ts wiki-init',
    )
  }
  let res: Response
  try {
    res = await fetch(`${NOTION_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${tok}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
  } catch (e) {
    die(`Notion unreachable (${(e as Error).name}) — wiki layer DEGRADED, not idle.`)
  }
  const body: any = await res.json().catch(() => ({}))
  if (!res.ok) {
    die(
      `Notion HTTP ${res.status}: ${body?.message ?? res.statusText}\n` +
        (res.status === 404
          ? '  A 404 here usually means the integration was never added to the page\n' +
            '  (Connections menu), not that the page is missing.'
          : ''),
    )
  }
  return body as T
}

/** Where the wiki lives. Discovered once, cached in the repo-local config. */
const CONFIG_PATH = `${process.env.HOME}/.claude/.swarm-config.json`

function loadConfig(): { notionRoot?: string } {
  try {
    return JSON.parse(require('node:fs').readFileSync(CONFIG_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function saveConfig(c: Record<string, unknown>) {
  require('node:fs').writeFileSync(CONFIG_PATH, `${JSON.stringify(c, null, 2)}\n`)
}

// ── notion block helpers ─────────────────────────────────────────────────────

/** Notion caps rich_text at 2000 chars per object; split rather than 400. */
function textBlocks(md: string): unknown[] {
  const out: unknown[] = []
  for (const raw of md.split('\n')) {
    const line = raw ?? ''
    let type = 'paragraph'
    let content = line
    if (line.startsWith('### ')) {
      type = 'heading_3'
      content = line.slice(4)
    } else if (line.startsWith('## ')) {
      type = 'heading_2'
      content = line.slice(3)
    } else if (line.startsWith('# ')) {
      type = 'heading_1'
      content = line.slice(2)
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      type = 'bulleted_list_item'
      content = line.slice(2)
    }
    for (let i = 0; i < Math.max(1, Math.ceil(content.length / 1900)); i++) {
      const chunk = content.slice(i * 1900, (i + 1) * 1900)
      out.push({
        object: 'block',
        type,
        [type]: { rich_text: chunk ? [{ type: 'text', text: { content: chunk } }] : [] },
      })
    }
  }
  return out.slice(0, 100) // Notion caps children per request
}

function plain(rich: any[]): string {
  return (rich ?? []).map((r) => r?.plain_text ?? '').join('')
}

// ── commands ─────────────────────────────────────────────────────────────────

async function cmdWhoami() {
  console.log(`role:   ${ROLE || '(UNSET — writes will be refused)'}`)
  console.log(`cwd:    ${process.cwd()}`)
  console.log('')

  // Linear
  try {
    const d = await linear<{ viewer: { name: string }; organization: { name: string } }>(
      '{ viewer { name } organization { name } }',
    )
    console.log(`linear: OK — ${d.viewer.name} @ ${d.organization.name} (team ${TEAM_KEY})`)
  } catch {
    console.log('linear: FAILED (see error above)')
  }

  // Notion — report unconfigured without dying, so whoami always completes
  const tok = notionToken()
  if (!tok) {
    console.log('notion: NOT CONFIGURED — wiki layer is OFF, not empty.')
    console.log('        run any wiki-* command for setup steps.')
  } else {
    const res = await fetch(`${NOTION_API}/users/me`, {
      headers: { Authorization: `Bearer ${tok}`, 'Notion-Version': NOTION_VERSION },
    })
    const b: any = await res.json().catch(() => ({}))
    console.log(
      res.ok
        ? `notion: OK — integration "${b?.name ?? b?.bot?.owner?.type ?? 'unknown'}"`
        : `notion: FAILED HTTP ${res.status}: ${b?.message ?? ''}`,
    )
    const cfg = loadConfig()
    console.log(`        root: ${cfg.notionRoot ?? '(unset — run wiki-init)'}`)
  }
}

const ISSUE_FIELDS = `
  identifier title url
  state { name type }
  project { name }
  assignee { name }
  labels(first:10) { nodes { name } }
  updatedAt`

/**
 * Resolve a `--project` / `--state` value against what Linear actually has
 * (FEL-430, fault 3).
 *
 * Without this, `cmdTasks` interpolated the raw string into
 * `project:{name:{eq:"…"}}`. Linear matched nothing and returned HTTP 200, so a
 * typo produced an empty list — and the caller was then TOLD the empty was
 * real. That is worse than a silent empty: a bare empty invites a second look,
 * an ASSERTED one forecloses it.
 *
 * `cmdNew` already resolved projects correctly. This hoists that pattern so
 * both read paths share one implementation instead of disagreeing.
 */
async function resolveFilterValue(
  kind: 'project' | 'state',
  value: string,
  known: () => Promise<string[]>,
): Promise<string> {
  const names = await known()
  const hit = names.find((n) => n.toLowerCase() === value.toLowerCase())
  if (hit) return hit
  die(
    `unknown ${kind} "${value}". Known ${kind}s: ${names.join(', ')}\n` +
      `Refusing to run the query — an unresolvable ${kind} returns an EMPTY result ` +
      `that is indistinguishable from "you have no work".`,
  )
}

async function cmdTasks(argv: string[]) {
  let project = argRef(argv, '--project')
  let state = argRef(argv, '--state')
  const limit = Number(argRef(argv, '--limit') ?? 40)

  // Resolve BEFORE querying. Note what is deliberately NOT done here: a genuine
  // no-match — a real project in a real state that happens to have no issues —
  // must still exit 0. Failing on every empty would trade one indistinguishable
  // pair for another and would look like a fix.
  if (project) {
    project = await resolveFilterValue('project', project, async () => {
      const p = await linear<{ projects: { nodes: { name: string }[] } }>(
        '{ projects(first:50) { nodes { name } } }',
      )
      return p.projects.nodes.map((n) => n.name)
    })
  }
  if (state) {
    state = await resolveFilterValue('state', state, async () => {
      const s = await linear<{ workflowStates: { nodes: { name: string }[] } }>(
        `{ workflowStates(first:50, filter:{team:{key:{eq:"${TEAM_KEY}"}}}) { nodes { name } } }`,
      )
      return [...new Set(s.workflowStates.nodes.map((n) => n.name))]
    })
  }

  const filter: string[] = [`team:{key:{eq:"${TEAM_KEY}"}}`]
  if (project) filter.push(`project:{name:{eq:"${project}"}}`)
  if (state) filter.push(`state:{name:{eq:"${state}"}}`)

  const d = await linear<{ issues: { nodes: any[] } }>(
    `{ issues(first:${limit}, orderBy:updatedAt, filter:{${filter.join(',')}}) { nodes { ${ISSUE_FIELDS} } } }`,
  )
  const ns = d.issues.nodes
  if (!ns.length) {
    console.log(`(no issues matched — team=${TEAM_KEY}${project ? ` project=${project}` : ''}${state ? ` state=${state}` : ''})`)
    console.log('This is a real empty result, not a failure: the query succeeded.')
    return
  }
  for (const n of ns) {
    const labels = n.labels.nodes.map((l: any) => l.name).filter((s: string) => s.startsWith('type:'))
    console.log(
      `${n.identifier.padEnd(9)} ${String(n.state.name).padEnd(12)} ` +
        `${String(n.project?.name ?? '-').padEnd(6)} ${n.title.slice(0, 64)}` +
        (labels.length ? `  [${labels.join(',')}]` : ''),
    )
  }
  console.log(`\n${ns.length} issue(s).`)
}

async function issueByIdentifier(id: string) {
  const d = await linear<{ issues: { nodes: any[] } }>(
    `{ issues(first:1, filter:{team:{key:{eq:"${TEAM_KEY}"}}, number:{eq:${Number(id.split('-')[1])}}}) { nodes { id ${ISSUE_FIELDS} description } } }`,
  )
  const n = d.issues.nodes[0]
  if (!n) die(`${id} not found in team ${TEAM_KEY}.`)
  return n
}

async function cmdShow(argv: string[]) {
  const id = argv[0]
  if (!id) die('usage: swarm show FEL-123')
  const n = await issueByIdentifier(id)
  console.log(`${n.identifier}  ${n.title}`)
  console.log(`state:    ${n.state.name}`)
  console.log(`project:  ${n.project?.name ?? '-'}`)
  console.log(`assignee: ${n.assignee?.name ?? '-'}`)
  console.log(`labels:   ${n.labels.nodes.map((l: any) => l.name).join(', ') || '-'}`)
  console.log(`url:      ${n.url}`)
  if (n.description) console.log(`\n${n.description}`)

  const c = await linear<{ issue: { comments: { nodes: any[] } } }>(
    `{ issue(id:"${n.id}") { comments(first:30) { nodes { body createdAt } } } }`,
  )
  // Sort by createdAt. Linear does NOT return comments in chronological order,
  // and the first version of this printed them raw — so `show | tail` handed
  // back something that was not the latest comment. That is how the author of
  // this tool posted a status update contradicting a finding recorded five
  // hours earlier: the newest comment was not where it looked.
  const cs = [...c.issue.comments.nodes].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  if (cs.length) {
    console.log(`\n--- ${cs.length} comment(s), oldest first; LAST is current ---`)
    for (const cm of cs) console.log(`\n[${cm.createdAt.slice(0, 16)}]\n${cm.body}`)
  }
}

async function cmdNote(argv: string[]) {
  const role = requireRole()
  const id = argv[0]
  const text = argv.slice(1).join(' ')
  if (!id || !text) die('usage: swarm note FEL-123 "message"')
  const n = await issueByIdentifier(id)
  await linear(
    `mutation($id:String!,$body:String!){ commentCreate(input:{issueId:$id, body:$body}) { success } }`,
    { id: n.id, body: `**[${role}]** ${text}` },
  )
  console.log(`noted on ${n.identifier} as [${role}]`)
}

async function cmdClaim(argv: string[]) {
  const role = requireRole()
  const id = argv[0]
  if (!id) die('usage: swarm claim FEL-123')
  const n = await issueByIdentifier(id)

  // Only one human is a real Linear user; agents are not seats. So the issue is
  // assigned to the human owner and the ACTING AGENT is recorded in a comment.
  // This is a deliberate decision, not a limitation worked around.
  const me = await linear<{ viewer: { id: string } }>('{ viewer { id } }')
  await linear(
    `mutation($id:String!,$a:String!){ issueUpdate(id:$id, input:{assigneeId:$a}) { success } }`,
    { id: n.id, a: me.viewer.id },
  )
  await linear(
    `mutation($id:String!,$body:String!){ commentCreate(input:{issueId:$id, body:$body}) { success } }`,
    { id: n.id, body: `**[${role}]** claiming this issue. Agent working it: \`${role}\`.` },
  )
  console.log(`${n.identifier} claimed by [${role}] (assignee: human owner)`)
}

async function cmdMove(argv: string[]) {
  const role = requireRole()
  const id = argv[0]
  const target = argv.slice(1).join(' ')
  if (!id || !target) die('usage: swarm move FEL-123 "In Progress"')
  const n = await issueByIdentifier(id)
  const d = await linear<{ team: { states: { nodes: any[] } } }>(
    `{ team(id:"${await teamId()}") { states(first:20) { nodes { id name } } } }`,
  )
  const st = d.team.states.nodes.find((s) => s.name.toLowerCase() === target.toLowerCase())
  if (!st) {
    die(`no such state "${target}". Available: ${d.team.states.nodes.map((s) => s.name).join(', ')}`)
  }
  await linear(
    `mutation($id:String!,$s:String!){ issueUpdate(id:$id, input:{stateId:$s}) { success } }`,
    { id: n.id, s: st.id },
  )
  await linear(
    `mutation($id:String!,$body:String!){ commentCreate(input:{issueId:$id, body:$body}) { success } }`,
    { id: n.id, body: `**[${role}]** moved to **${st.name}**.` },
  )
  console.log(`${n.identifier} -> ${st.name} by [${role}]`)
}

/**
 * File a new issue. Added because the author of this tool had to fall back to
 * raw curl to file FEL-426 — a security finding that had already gone a day
 * unowned. A memory layer you cannot record a finding into is half-built, and
 * the missing half is the one that matters when something is urgent.
 */
async function cmdNew(argv: string[]) {
  const role = requireRole()
  const title = argRef(argv, '--title')
  const project = argRef(argv, '--project') ?? 'aihu'
  const priority = Number(argRef(argv, '--priority') ?? 3)
  // Validate BEFORE any stdin read. The first version awaited stdin first and
  // HUNG FOREVER when invoked with no args from a non-TTY context: isTTY is
  // false whenever this runs from a script or an agent, so "no pipe" is
  // indistinguishable from "pipe that has not sent data yet". A hanging tool is
  // worse than a failing one -- it produces no output to diagnose.
  if (!title) die('usage: swarm new --title "T" [--project aihu] [--priority 0-4] [--body "..." | --stdin]')
  if (!PROJECTS.includes(project as any)) {
    die(`unknown project "${project}". Known: ${PROJECTS.join(', ')}`)
  }

  const p = await linear<{ projects: { nodes: { id: string; name: string }[] } }>(
    '{ projects(first:20) { nodes { id name } } }',
  )
  const body = argRef(argv, '--body') ?? (argv.includes('--stdin') ? await readStdin() : '')
  const proj = p.projects.nodes.find((x) => x.name === project)
  if (!proj) die(`project "${project}" not found in Linear`)

  const d = await linear<{ issueCreate: { issue: { identifier: string; url: string } } }>(
    `mutation($t:String!,$d:String!,$team:String!,$p:String!,$pri:Int!){
       issueCreate(input:{title:$t, description:$d, teamId:$team, projectId:$p, priority:$pri}) {
         issue { identifier url } } }`,
    {
      t: title,
      d: `${body}\n\n---\n_Filed by \`[${role}]\` via swarm._`,
      team: await teamId(),
      p: proj.id,
      pri: priority,
    },
  )
  const i = d.issueCreate.issue
  console.log(`filed ${i.identifier} in ${project} by [${role}]\n${i.url}`)
}

let _teamId = ''
async function teamId(): Promise<string> {
  if (_teamId) return _teamId
  const d = await linear<{ teams: { nodes: { id: string }[] } }>(
    `{ teams(first:1, filter:{key:{eq:"${TEAM_KEY}"}}) { nodes { id } } }`,
  )
  if (!d.teams.nodes[0]) die(`team ${TEAM_KEY} not found`)
  _teamId = d.teams.nodes[0].id
  return _teamId
}

// ── wiki (Notion) ────────────────────────────────────────────────────────────

async function cmdWikiInit() {
  const d = await notion<{ results: any[] }>('/search', {
    method: 'POST',
    body: JSON.stringify({ filter: { property: 'object', value: 'page' }, page_size: 50 }),
  })
  if (!d.results.length) {
    die(
      'Notion search returned ZERO pages with HTTP 200.\n' +
        '  That is almost never "the workspace is empty" — it means the\n' +
        '  integration has not been added to any page. Open the page you want\n' +
        '  as the swarm root -> ... -> Connections -> add the integration,\n' +
        '  then re-run wiki-init.',
    )
  }
  console.log('Pages this integration can see:\n')
  for (const p of d.results) {
    const title = plain(
      Object.values(p.properties ?? {}).find((v: any) => v?.type === 'title')?.title ?? [],
    )
    console.log(`  ${p.id}  ${title || '(untitled)'}`)
  }
  console.log('\nSet the root with:')
  console.log('  bun .claude/skills/swarm/swarm.ts wiki-root <page-id>')
}

async function cmdWikiRoot(argv: string[]) {
  const id = argv[0]
  if (!id) die('usage: swarm wiki-root <page-id>   (list them with wiki-init)')
  await notion(`/pages/${id}`) // verifies reachability, dies loudly otherwise
  const cfg = loadConfig()
  cfg.notionRoot = id
  saveConfig(cfg)
  console.log(`swarm wiki root set: ${id}\nstored in ${CONFIG_PATH}`)
}

function requireRoot(): string {
  const r = loadConfig().notionRoot
  if (!r) die('no wiki root configured. Run: swarm wiki-init, then swarm wiki-root <id>')
  return r
}

async function cmdRecall(argv: string[]) {
  const q = argv.join(' ')
  if (!q) die('usage: swarm recall <query>')
  const d = await notion<{ results: any[] }>('/search', {
    method: 'POST',
    body: JSON.stringify({ query: q, page_size: 20 }),
  })
  if (!d.results.length) {
    // FEL-430, fault 3 (wiki half). Notion `/search` returns HTTP 200 with
    // `results: []` in BOTH of these cases, and they are not the same thing:
    //
    //   a) nothing matched the query          — a real empty
    //   b) the integration can see nothing    — the wiki layer is OFF
    //
    // Declaring (b) "genuinely empty" is the exact incident the Roster page
    // records as having already happened once. The distinguishing signal was
    // always available: an unfiltered search returns whatever the integration
    // CAN see, so a zero there means no access rather than no match.
    //
    // Probe before asserting. No try/catch here, deliberately: `notion()`
    // `die()`s on both the network path and `!res.ok`, so it never throws and a
    // probe failure already exits 1 with a specific cause — "Notion unreachable
    // ... DEGRADED" or "Notion HTTP 400: ...". Wrapping it would add a branch
    // nothing can enter.
    //
    // FEL-438: this file previously carried exactly that branch, plus a
    // verification table row claiming it fired. The row was produced by
    // mutating the assignment into a `throw` — forcing the state at the
    // VARIABLE rather than the condition at the CAUSE. The mutation applied and
    // proved nothing; a real probe failure gives `Notion HTTP 400`, never
    // `UNVERIFIABLE`. Found by verifier, who induced the fault at the endpoint.
    const probe = await notion<{ results: any[] }>('/search', {
      method: 'POST',
      body: JSON.stringify({ query: '', page_size: 1 }),
    })
    const visible = probe.results.length

    if (visible === 0) {
      die(
        `wiki layer is OFF, not empty: the integration can see ZERO pages.\n` +
          `"${q}" returned 0 results, but so does an unfiltered search — so this is an ` +
          `access problem, not a search result.\n` +
          `Share the root page with your Notion integration (Connections → add it), ` +
          `then re-run.`,
      )
    }
    console.log(
      `(no wiki pages matched "${q}" — genuinely empty: the integration can see ` +
        `at least one page, so access is live and the query simply did not match)`,
    )
    return
  }

  // Notion search is fuzzy AND index-delayed: a page created seconds ago may be
  // absent, while an unrelated page ranks first. Searching "Roster Operating
  // Protocol" once returned "Fellwork Operations" as the top hit. An agent that
  // trusts result[0] therefore reads the WRONG page and has no signal it did.
  //
  // So rank exact/substring title matches above whatever Notion's relevance
  // returned, and label every row with how it matched. The agent decides.
  const rows = d.results.map((p: any) => {
    const title = plain(
      Object.values(p.properties ?? {}).find((v: any) => v?.type === 'title')?.title ?? [],
    )
    const lt = title.toLowerCase()
    const lq = q.toLowerCase()
    const rank = lt === lq ? 0 : lt.includes(lq) ? 1 : lq.includes(lt) && lt ? 2 : 3
    return { id: p.id, title, url: p.url ?? '', rank }
  })
  rows.sort((a, b) => a.rank - b.rank)

  const LABEL = ['EXACT title', 'title contains query', 'query contains title', 'fuzzy — Notion relevance only']
  for (const r of rows) {
    console.log(`${r.id}  ${r.title || '(untitled)'}\n    [${LABEL[r.rank]}]  ${r.url}`)
  }
  if (rows[0].rank === 3) {
    console.log(
      `\nNOTE: no title matched "${q}". Every hit above is Notion's fuzzy relevance,\n` +
        'which regularly ranks an unrelated page first. Confirm the title before\n' +
        'trusting the content. A page created moments ago may not be indexed yet.',
    )
  }
}

async function cmdWikiRead(argv: string[]) {
  const id = argv[0]
  if (!id) die('usage: swarm wiki-read <page-id>   (find ids with: swarm recall <query>)')
  const page = await notion<any>(`/pages/${id}`)
  const title = plain(
    Object.values(page.properties ?? {}).find((v: any) => v?.type === 'title')?.title ?? [],
  )
  console.log(`# ${title}\n`)
  let cursor: string | undefined
  do {
    const b = await notion<{ results: any[]; next_cursor?: string; has_more: boolean }>(
      `/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`,
    )
    for (const blk of b.results) {
      const t = blk.type
      const rt = blk[t]?.rich_text
      if (!rt) continue
      const txt = plain(rt)
      if (t === 'heading_1') console.log(`\n# ${txt}`)
      else if (t === 'heading_2') console.log(`\n## ${txt}`)
      else if (t === 'heading_3') console.log(`\n### ${txt}`)
      else if (t === 'bulleted_list_item') console.log(`- ${txt}`)
      else console.log(txt)
    }
    cursor = b.has_more ? b.next_cursor : undefined
  } while (cursor)
}

async function cmdWikiWrite(argv: string[]) {
  const role = requireRole()
  const title = argRef(argv, '--title')
  const append = argRef(argv, '--append')
  const body = argRef(argv, '--body') ?? (argv.includes('--stdin') ? await readStdin() : '')
  if (!body.trim()) die('nothing to write: pass --body "..." or --stdin (then pipe markdown)')

  const stamp = `_[${role}] via swarm_`

  if (append) {
    await notion(`/blocks/${append}/children`, {
      method: 'PATCH',
      body: JSON.stringify({ children: textBlocks(`${body}\n${stamp}`) }),
    })
    console.log(`appended to ${append} as [${role}]`)
    return
  }
  if (!title) die('usage: swarm wiki-write --title "T" [--body "..."] | --append <page-id>')
  const page = await notion<any>('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { page_id: requireRoot() },
      properties: { title: { title: [{ type: 'text', text: { content: title } }] } },
      children: textBlocks(`${body}\n${stamp}`),
    }),
  })
  console.log(`created: ${page.url ?? page.id}`)
}

// ── plumbing ─────────────────────────────────────────────────────────────────

function argRef(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : undefined
}

/** Only ever called behind an explicit --stdin flag; see cmdNew for why. */
async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return ''
  return await Bun.stdin.text()
}

const USAGE = `swarm — the agent swarm's shared consciousness (Notion wiki + Linear tasks)

  whoami                          resolve role, health-check both backends

TASKS (Linear, team ${TEAM_KEY}; projects: ${PROJECTS.join(', ')})
  tasks [--project P] [--state S] [--limit N]
  show   FEL-123
  claim  FEL-123                  assign owner + record acting agent
  note   FEL-123 "message"        comment, attributed to your role
  move   FEL-123 "In Progress"
  new    --title "T" [--project aihu] [--priority 0-4] [--body "..."]

WIKI (Notion)
  wiki-init                       list pages the integration can see
  wiki-root <page-id>             set the swarm root page
  recall <query>                  search the wiki
  wiki-read <page-id>             read a page as markdown
  wiki-write --title "T" [--body "..."]      create under root (or pipe stdin)
  wiki-write --append <page-id> [--body ...] append to an existing page

Role comes from AIHU_SLACK_ROLE or a .agent-role file in cwd/ancestors.
Tokens come from the macOS keychain and are never printed.`

const [cmd, ...rest] = process.argv.slice(2)
const table: Record<string, (a: string[]) => Promise<void>> = {
  whoami: async () => cmdWhoami(),
  tasks: cmdTasks,
  show: cmdShow,
  claim: cmdClaim,
  note: cmdNote,
  move: cmdMove,
  new: cmdNew,
  'wiki-init': async () => cmdWikiInit(),
  'wiki-root': cmdWikiRoot,
  recall: cmdRecall,
  'wiki-read': cmdWikiRead,
  'wiki-write': cmdWikiWrite,
}

if (!cmd || cmd === 'help' || cmd === '--help') {
  console.log(USAGE)
  process.exit(0)
}
const fn = table[cmd]
if (!fn) {
  console.error(`swarm: unknown command "${cmd}"\n`)
  console.log(USAGE)
  process.exit(1)
}
await fn(rest)
