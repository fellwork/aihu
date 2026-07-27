//! swarm-bus — Rust reimplementation of the portable core of `~/.swarm/bus.py`.
//!
//! WHY THIS EXISTS
//!   bus.py is the ORACLE: a thin Python CLI over one SQLite file
//!   (`~/.swarm/bus.db`, overridable via `SWARM_DB`) that lets swarm agents
//!   broadcast/pull messages and negotiate work via CONTRACTs (offer → claim
//!   → verdict → reconciled status). This crate is a drop-in, compiled
//!   reimplementation against the *same* schema and the *same* exit-code
//!   contract: an empty result must never read like a broken query.
//!
//! EXIT CODES (matches the oracle)
//!   0  = ok (including a successful non-empty `pull`/`watch`)
//!   2  = broken input: missing/unknown role, missing required field, no
//!        such contract, a verdict with no --contract, a blocked with no
//!        --question
//!   3  = genuinely empty (a `pull`/`watch` with nothing new — NOT an error)
//!   4  = conflict (claiming a contract someone else already owns)
//!   5  = IDENTITY MISMATCH (bound_identity: role is registered to a
//!        different workspace than the one this process is running in)
//!   64 = unknown command / no command given
//!   1  = unexpected internal error (DB I/O etc.) — the oracle has no
//!        distinct code for this either; an uncaught Python exception also
//!        exits 1.
//!
//! FULL COMMAND SURFACE (parity with bus.py)
//!   send offer claim ack attempt setstatus pull watch ready
//!   (`status`, the oracle's pretty-printed contract table, is intentionally
//!   not reproduced here — it's a human dashboard, not a coordination
//!   primitive, and every field it prints is already reachable via `pull`/
//!   direct DB read. Nothing in the brief asked for it.)
//!
//! TYPED PAYLOADS (docs/typed-bus-payloads.md, agent-swarm@design/typed-bus-payloads)
//!   The actionable parts of a message are validated FIELDS, not prose to be
//!   regexed downstream by a consumer. Concretely:
//!     - `msg.contract` (already existed) — a `verdict` MUST set it; rejected
//!       at the boundary (exit 2) if absent, never silently accepted.
//!     - `msg.pr` (new, nullable INTEGER) / `msg.claims` (new, nullable TEXT,
//!       "verb:target,verb:target") — optional structured fields on `send`.
//!     - a `blocked` MUST set `--question` (exit 2 if absent) — the one
//!       thing a human must decide, not buried in `body`.
//!     - `contract.needs` (new, nullable TEXT, comma-separated contract ids)
//!       — the Graph/DAG edge. `ready --id C` reports whether every upstream
//!       need has reached a satisfied status.
//!
//! DIVERGENCES FROM THE ORACLE (deliberate, logged per the brief)
//!   1. `offer` here does NOT require `--brief`. The oracle's cmd_offer
//!      requires issue/surface/must-pass/must-fail/brief/to; the spec this
//!      crate was built against only requires issue/to/surface/must-pass/
//!      must-fail. `--brief` is accepted and folded into the dispatched
//!      message body when present; omitted otherwise. Flagged explicitly —
//!      do not read this as full oracle parity on `offer`.
//!   2. `offer`'s `--to` is, exactly as in the oracle, only checked for
//!      *presence*, not validated against the known-role set (the oracle's
//!      cmd_offer never calls need_role on `to`). Reproduced faithfully,
//!      not accidentally.
//!   3. A `blocked` message here is only required to carry `--question`
//!      (per this crate's brief). The typed-payload design doc's `Blocked`
//!      Zod schema also makes `contract` required on a blocked payload;
//!      that extra constraint is NOT enforced here because it is outside
//!      this crate's stated acceptance surface and would silently reject
//!      pre-existing `--kind blocked` traffic that never set `--contract`.
//!      Logged, not silently dropped.
//!   4. `watch`'s timestamp column is formatted in UTC, not the oracle's
//!      `time.localtime`. Reproducing local-timezone formatting would pull
//!      in a chrono/time dependency for a cosmetic column; the ordering and
//!      content of every row are otherwise identical. If wall-clock-local
//!      display ever matters to a consumer, that's the moment to add the
//!      dependency — not preemptively.
//!   5. `status` (the oracle's pretty-printed contract table) is not
//!      implemented — see FULL COMMAND SURFACE above.

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::env;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const ROLES: &[&str] = &[
    "orchestrator",
    "verifier",
    "architect",
    "historian",
    "builder",
    "builder-a",
    "builder-b",
    "investigator",
];

// ---------------------------------------------------------------------------
// Argument parsing: a per-arg `--k v` pairs parser, mirroring bus.py's hand
// rolled loop exactly (a bare `--flag` with no following non-flag token is a
// boolean flag, not a missing value).
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
enum ArgVal {
    Str(String),
    Flag,
}

type Args = HashMap<String, ArgVal>;

fn parse_args(raw: &[String]) -> Args {
    let mut args: Args = HashMap::new();
    let mut i = 0;
    while i < raw.len() {
        if let Some(k) = raw[i].strip_prefix("--") {
            if i + 1 < raw.len() && !raw[i + 1].starts_with("--") {
                args.insert(k.to_string(), ArgVal::Str(raw[i + 1].clone()));
                i += 2;
            } else {
                args.insert(k.to_string(), ArgVal::Flag);
                i += 1;
            }
        } else {
            i += 1;
        }
    }
    args
}

trait ArgsExt {
    fn get_str(&self, key: &str) -> Option<&str>;
    fn get_flag(&self, key: &str) -> bool;
}

impl ArgsExt for Args {
    fn get_str(&self, key: &str) -> Option<&str> {
        match self.get(key) {
            Some(ArgVal::Str(s)) => Some(s.as_str()),
            _ => None,
        }
    }
    fn get_flag(&self, key: &str) -> bool {
        self.contains_key(key)
    }
}

// ---------------------------------------------------------------------------
// Failure posture: every error prints a specific cause to stderr, never a
// silent empty result. `die` is the single choke point.
// ---------------------------------------------------------------------------

fn die(msg: &str, code: i32) -> ! {
    eprintln!("swarm-bus: {msg}");
    std::process::exit(code);
}

fn need_role(role: Option<&str>, what: &str) -> String {
    let r = match role {
        Some(s) if !s.is_empty() => s,
        _ => die(&format!("{what} is required"), 2),
    };
    if r != "all" && !ROLES.contains(&r) {
        let mut known: Vec<&str> = ROLES.to_vec();
        known.sort();
        die(
            &format!("unknown role '{r}'. Known: {}", known.join(", ")),
            2,
        );
    }
    r.to_string()
}

fn req_field<'a>(args: &'a Args, key: &str) -> &'a str {
    match args.get_str(key) {
        Some(v) if !v.is_empty() => v,
        _ => die(
            &format!(
                "--{key} is required. A contract without a bidirectional \
                 acceptance bar is a wish, not a contract."
            ),
            2,
        ),
    }
}

fn now_ts() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64()
}

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

// ---------------------------------------------------------------------------
// Identity: IDENTITY = (workspace, role). Matches bus.py's bound_identity()
// exactly. The registry at `~/.swarm/agents.json` (HOME-relative, so
// SWARM_DB-style overrides via a swapped HOME work for tests) maps
// role -> cwd and is written by the SUPERVISOR, never by agents — so a
// sender's claimed role is checked against where the process is actually
// running, rather than trusted because it said so. This is checkable, NOT
// cryptographic: an agent could `cd` before calling. Roles absent from the
// registry (human-driven, e.g. orchestrator) pass through untouched — the
// supervisor does not own them, so it cannot vouch for them.
// ---------------------------------------------------------------------------

fn agents_registry_path() -> PathBuf {
    let home = env::var("HOME").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".swarm").join("agents.json")
}

/// realpath-ish: canonicalize when the path exists (resolves symlinks,
/// mirrors Python's os.path.realpath), else fall back to a plain absolute
/// join so a not-yet-created directory still compares sanely instead of
/// erroring.
fn realpath_like(p: &str) -> String {
    let path = PathBuf::from(p);
    if let Ok(canon) = std::fs::canonicalize(&path) {
        return canon.to_string_lossy().to_string();
    }
    if path.is_absolute() {
        return path.to_string_lossy().to_string();
    }
    match env::current_dir() {
        Ok(cwd) => cwd.join(path).to_string_lossy().to_string(),
        Err(_) => path.to_string_lossy().to_string(),
    }
}

fn bound_identity(role: &str) {
    let reg_path = agents_registry_path();
    if !reg_path.exists() {
        return;
    }
    let content = match std::fs::read_to_string(&reg_path) {
        Ok(c) => c,
        Err(e) => die(
            &format!("registry unreadable ({e}) — refusing to guess identity"),
            2,
        ),
    };
    let reg: Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(e) => die(
            &format!("registry unreadable ({e}) — refusing to guess identity"),
            2,
        ),
    };
    let entry = match reg.get(role) {
        Some(e) if e.is_object() => e,
        _ => return, // human-driven role; not supervisor-owned
    };
    let want_raw = match entry.get("cwd").and_then(Value::as_str) {
        Some(s) => s,
        None => return, // malformed entry; nothing to bind against
    };
    let want = realpath_like(want_raw);
    let here = realpath_like(
        &env::current_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| ".".to_string()),
    );
    if here != want && !here.starts_with(&format!("{want}{}", std::path::MAIN_SEPARATOR)) {
        die(
            &format!(
                "IDENTITY MISMATCH: role '{role}' is bound to {want}, but this \
                 process is in {here}. A role is (workspace, role) — send from \
                 your own workspace or use your own role."
            ),
            5,
        );
    }
}

// ---------------------------------------------------------------------------
// DB: one SQLite file, schema created idempotently on every open (matches
// the oracle's db() exactly, including ALTER-if-missing columns so an
// existing bus.db is upgraded in place rather than rejected).
// ---------------------------------------------------------------------------

fn db_path() -> PathBuf {
    if let Ok(p) = env::var("SWARM_DB") {
        return PathBuf::from(p);
    }
    let home = env::var("HOME").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".swarm").join("bus.db")
}

fn ensure_column(conn: &Connection, table: &str, column: &str, coltype: &str) -> rusqlite::Result<()> {
    let mut has_col = false;
    {
        let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
        let mut rows = stmt.query([])?;
        while let Some(row) = rows.next()? {
            let name: String = row.get(1)?;
            if name == column {
                has_col = true;
                break;
            }
        }
    }
    if !has_col {
        conn.execute(&format!("ALTER TABLE {table} ADD COLUMN {column} {coltype}"), [])?;
    }
    Ok(())
}

fn open_db() -> rusqlite::Result<Connection> {
    let path = db_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let conn = Connection::open(&path)?;
    conn.busy_timeout(std::time::Duration::from_secs(10))?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS msg(
           id TEXT PRIMARY KEY, ts REAL, sender TEXT, recipient TEXT,
           kind TEXT, body TEXT, contract TEXT);
         CREATE TABLE IF NOT EXISTS seen(role TEXT, msg TEXT, PRIMARY KEY(role,msg));
         CREATE TABLE IF NOT EXISTS attempt(role TEXT, msg TEXT, n INTEGER, PRIMARY KEY(role,msg));
         CREATE TABLE IF NOT EXISTS contract(
           id TEXT PRIMARY KEY, ts REAL, issue TEXT, owner TEXT, surface TEXT,
           must_pass TEXT, must_fail TEXT, status TEXT, note TEXT);",
    )?;
    // Idempotent ALTERs — same posture as the oracle's `recon` upgrade path,
    // extended for the typed-payload fields (docs/typed-bus-payloads.md).
    ensure_column(&conn, "contract", "recon", "TEXT")?;
    ensure_column(&conn, "contract", "needs", "TEXT")?;
    ensure_column(&conn, "msg", "pr", "INTEGER")?;
    ensure_column(&conn, "msg", "claims", "TEXT")?;
    Ok(conn)
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

fn cmd_send(args: &Args) -> rusqlite::Result<()> {
    let from = need_role(args.get_str("from"), "--from");
    bound_identity(&from);
    let to = need_role(args.get_str("to"), "--to");
    let body = match args.get_str("body") {
        Some(b) if !b.is_empty() => b,
        _ => die("--body is required (an empty message is not a message)", 2),
    };
    let kind = args.get_str("kind").unwrap_or("note");
    let contract = args.get_str("contract");

    // Typed-payload boundary checks (docs/typed-bus-payloads.md): the
    // actionable parts of a verdict/blocked message are validated fields,
    // never prose a consumer has to regex out downstream. Reject here, not
    // silently accept and let a consumer discover the gap later.
    if kind == "verdict" {
        match contract {
            Some(c) if !c.is_empty() => {}
            _ => die("a verdict must name its contract", 2),
        }
    }
    if kind == "blocked" {
        match args.get_str("question") {
            Some(q) if !q.is_empty() => {}
            _ => die(
                "a blocked message must carry --question — the one thing a human must decide",
                2,
            ),
        }
    }

    let pr: Option<i64> = match args.get_str("pr") {
        Some(p) => match p.parse::<i64>() {
            Ok(v) => Some(v),
            Err(_) => die(&format!("--pr must be an integer, got '{p}'"), 2),
        },
        None => None,
    };
    let claims = args.get_str("claims");

    let conn = open_db()?;
    let mid = new_id();
    let ts = now_ts();
    // Column-explicit insert: a positional VALUES(...) breaks the moment a
    // column is added and the writer isn't updated.
    conn.execute(
        "INSERT INTO msg (id, ts, sender, recipient, kind, body, contract, pr, claims) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![mid, ts, from, to, kind, body, contract, pr, claims],
    )?;
    // A verdict is the owner declaring done, not the supervisor reconciling
    // it: flip the contract to 'submitted', never 'verified'.
    if kind == "verdict" {
        if let Some(cid) = contract {
            conn.execute(
                "UPDATE contract SET status='submitted' \
                 WHERE id=?1 AND status IN ('claimed','building','offered')",
                params![cid],
            )?;
        }
    }
    println!("{mid}");
    Ok(())
}

fn cmd_pull(args: &Args) -> rusqlite::Result<()> {
    let role = need_role(args.get_str("role"), "--role");
    if role == "all" {
        die("--role all is not a reader; pull as a specific role", 2);
    }
    let peek = args.get_flag("peek");
    let conn = open_db()?;

    let mut out: Vec<Value> = Vec::new();
    let mut ids: Vec<String> = Vec::new();
    {
        let mut stmt = conn.prepare(
            "SELECT m.id, m.ts, m.sender, m.recipient, m.kind, m.body, m.contract, COALESCE(a.n, 0)
             FROM msg m LEFT JOIN attempt a ON a.msg = m.id AND a.role = ?1
             WHERE (m.recipient = ?2 OR m.recipient = 'all') AND m.sender != ?3
               AND m.id NOT IN (SELECT msg FROM seen WHERE role = ?4)
             ORDER BY m.ts",
        )?;

        let rows = stmt.query_map(params![role, role, role, role], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, f64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, i64>(7)?,
            ))
        })?;

        for r in rows {
            let (id, ts, from, to, kind, body, contract, attempts) = r?;
            ids.push(id.clone());
            let mut obj = Map::new();
            obj.insert("id".into(), json!(id));
            obj.insert("ts".into(), json!(ts));
            obj.insert("from".into(), json!(from));
            obj.insert("to".into(), json!(to));
            obj.insert("kind".into(), json!(kind));
            obj.insert("body".into(), json!(body));
            obj.insert(
                "contract".into(),
                contract.map(Value::from).unwrap_or(Value::Null),
            );
            obj.insert("attempts".into(), json!(attempts));
            out.push(Value::Object(obj));
        }
    }

    if !peek {
        for id in &ids {
            conn.execute(
                "INSERT OR IGNORE INTO seen VALUES (?1, ?2)",
                params![role, id],
            )?;
        }
    }

    println!(
        "{}",
        serde_json::to_string_pretty(&out).unwrap_or_else(|_| "[]".to_string())
    );
    // 0 = real messages, 3 = genuinely empty. Never conflate with an error.
    std::process::exit(if out.is_empty() { 3 } else { 0 });
}

fn cmd_offer(args: &Args) -> rusqlite::Result<()> {
    // Required per this crate's spec: issue/to/surface/must-pass/must-fail.
    // (See module doc divergence #1: the oracle also requires --brief.)
    let issue = req_field(args, "issue");
    let to = req_field(args, "to");
    let surface = req_field(args, "surface");
    let must_pass = req_field(args, "must-pass");
    let must_fail = req_field(args, "must-fail");
    let note = args.get_str("note").unwrap_or("");
    let brief = args.get_str("brief").unwrap_or("");
    let from = args.get_str("from").unwrap_or("orchestrator");
    // The Graph/DAG edge (docs/typed-bus-payloads.md): comma-separated
    // upstream contract ids this contract depends on. Optional — a contract
    // with no needs is trivially ready.
    let needs = args.get_str("needs");
    let cid = args
        .get_str("id")
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("C-{issue}"));

    let conn = open_db()?;
    let ts = now_ts();
    // Column-explicit insert: a positional VALUES(...) breaks the moment a
    // column is added (recon, needs) and the writer isn't updated.
    conn.execute(
        "INSERT OR REPLACE INTO contract \
         (id, ts, issue, owner, surface, must_pass, must_fail, status, note, needs) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'offered', ?8, ?9)",
        params![cid, ts, issue, to, surface, must_pass, must_fail, note, needs],
    )?;

    // Dispatch the brief atomically: no contract without a work order.
    let mid = new_id();
    let body = format!(
        "CONTRACT {cid} — claim it before you start:\n  \
         swarm-bus claim --id {cid} --role {to}\n\n\
         {brief}\n\n\
         MUST PASS: {must_pass}\n\
         MUST FAIL (run this direction too): {must_fail}\n\
         SURFACE (stay inside it): {surface}\n\n\
         Report with: swarm-bus send --from {to} --to orchestrator --kind verdict \
         --contract {cid} --body '...'"
    );
    conn.execute(
        "INSERT INTO msg (id, ts, sender, recipient, kind, body, contract) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![mid, ts, from, to, "dispatch", body, cid],
    )?;

    println!("{cid} offered + dispatched to {to}");
    Ok(())
}

fn cmd_claim(args: &Args) -> rusqlite::Result<()> {
    let who = need_role(args.get_str("role"), "--role");
    bound_identity(&who);
    let cid = match args.get_str("id") {
        Some(v) if !v.is_empty() => v,
        _ => die("--id is required", 2),
    };

    let conn = open_db()?;
    let row: Option<(Option<String>, String)> = conn
        .query_row(
            "SELECT owner, status FROM contract WHERE id = ?1",
            params![cid],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;

    let (owner, status) = match row {
        Some(v) => v,
        None => die(
            &format!("no contract '{cid}' — the QUESTION is wrong, not the answer"),
            2,
        ),
    };

    if let Some(o) = &owner {
        if o != &who && status != "offered" {
            die(
                &format!(
                    "CONFLICT: '{cid}' is already {status} by {o}. \
                     Counter or decline; do not co-own."
                ),
                4,
            );
        }
    }

    conn.execute(
        "UPDATE contract SET owner = ?1, status = 'claimed' WHERE id = ?2",
        params![who, cid],
    )?;
    println!("{cid} claimed by {who}");
    Ok(())
}

fn cmd_ack(args: &Args) -> rusqlite::Result<()> {
    let role = need_role(args.get_str("role"), "--role");
    let ids_raw = args.get_str("ids").unwrap_or("");
    let ids: Vec<&str> = ids_raw.split(',').filter(|s| !s.is_empty()).collect();
    if ids.is_empty() {
        die(
            "--ids is required (comma-separated); acking nothing is not acking",
            2,
        );
    }
    let conn = open_db()?;
    for id in &ids {
        conn.execute(
            "INSERT OR IGNORE INTO seen VALUES (?1, ?2)",
            params![role, id],
        )?;
    }
    println!("acked {} for {role}", ids.len());
    Ok(())
}

fn cmd_attempt(args: &Args) -> rusqlite::Result<()> {
    // Record that delivery was ATTEMPTED (distinct from `ack`, which records
    // success). At-least-once redelivery is made visible as a count instead
    // of arriving as a fresh instruction the agent may already have obeyed.
    let role = need_role(args.get_str("role"), "--role");
    let ids_raw = args.get_str("ids").unwrap_or("");
    let ids: Vec<&str> = ids_raw.split(',').filter(|s| !s.is_empty()).collect();
    if ids.is_empty() {
        die("--ids is required", 2);
    }
    let conn = open_db()?;
    for id in &ids {
        conn.execute(
            "INSERT INTO attempt (role, msg, n) VALUES (?1, ?2, 1) \
             ON CONFLICT(role, msg) DO UPDATE SET n = n + 1",
            params![role, id],
        )?;
    }
    println!("attempted {} for {role}", ids.len());
    Ok(())
}

fn cmd_setstatus(args: &Args) -> rusqlite::Result<()> {
    let (cid, status) = match (args.get_str("id"), args.get_str("status")) {
        (Some(c), Some(s)) if !c.is_empty() && !s.is_empty() => (c, s),
        _ => die("--id and --status are required", 2),
    };

    let conn = open_db()?;
    let exists: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM contract WHERE id = ?1",
            params![cid],
            |r| r.get(0),
        )
        .optional()?;
    if exists.is_none() {
        die(&format!("no contract '{cid}'"), 2);
    }

    let recon = args.get_str("recon").unwrap_or("");
    conn.execute(
        "UPDATE contract SET status = ?1, recon = ?2 WHERE id = ?3",
        params![status, recon, cid],
    )?;
    println!("{cid} -> {status}");
    Ok(())
}

/// UTC HH:MM:SS from a unix-epoch-seconds float — no timezone crate; see
/// module doc divergence #4.
fn format_hms_utc(ts: f64) -> String {
    let secs = ts as i64;
    let secs_of_day = secs.rem_euclid(86400);
    let h = secs_of_day / 3600;
    let m = (secs_of_day % 3600) / 60;
    let s = secs_of_day % 60;
    format!("{h:02}:{m:02}:{s:02}")
}

fn cmd_watch(args: &Args) -> rusqlite::Result<()> {
    // Every message, addressed or not — the cross-talk IS the value.
    // --role is required (matches the oracle) even though watch shows
    // everything regardless of who is watching.
    let _role = need_role(args.get_str("role"), "--role");
    let limit: i64 = args
        .get_str("limit")
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(30);

    let conn = open_db()?;
    let mut stmt = conn.prepare(
        "SELECT ts, sender, recipient, kind, body FROM msg ORDER BY ts DESC LIMIT ?1",
    )?;
    let rows: Vec<(f64, String, String, String, String)> = stmt
        .query_map(params![limit], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    for (ts, sender, recipient, kind, body) in rows.iter().rev() {
        let trimmed: String = body.chars().take(160).collect();
        println!(
            "[{}] {sender} -> {recipient} ({kind}): {trimmed}",
            format_hms_utc(*ts)
        );
    }
    std::process::exit(if rows.is_empty() { 3 } else { 0 });
}

fn cmd_ready(args: &Args) -> rusqlite::Result<()> {
    // The read half of the Graph/DAG edge: is every upstream `needs` id
    // satisfied? A need is satisfied when its status is 'verified' or
    // 'no-claims' (docs/typed-bus-payloads.md Contract.status enum) — any
    // other existing status, or a needs-id that names no contract at all,
    // is unmet and named in the output.
    let cid = match args.get_str("id") {
        Some(v) if !v.is_empty() => v,
        _ => die("--id is required", 2),
    };

    let conn = open_db()?;
    let needs_row: Option<Option<String>> = conn
        .query_row(
            "SELECT needs FROM contract WHERE id = ?1",
            params![cid],
            |r| r.get::<_, Option<String>>(0),
        )
        .optional()?;
    let needs_str = match needs_row {
        Some(v) => v,
        None => die(&format!("no contract '{cid}'"), 2),
    };
    let needs: Vec<&str> = needs_str
        .as_deref()
        .unwrap_or("")
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();

    if needs.is_empty() {
        println!("{cid} ready (no needs declared)");
        return Ok(());
    }

    let mut unmet: Vec<String> = Vec::new();
    for n in &needs {
        let status: Option<String> = conn
            .query_row("SELECT status FROM contract WHERE id = ?1", params![n], |r| r.get(0))
            .optional()?;
        match status.as_deref() {
            Some("verified") | Some("no-claims") => {}
            Some(s) => unmet.push(format!("{n} ({s})")),
            None => unmet.push(format!("{n} (no such contract)")),
        }
    }

    if unmet.is_empty() {
        println!("{cid} ready — needs satisfied: {}", needs.join(", "));
        Ok(())
    } else {
        println!("{cid} NOT ready — unmet needs: {}", unmet.join(", "));
        std::process::exit(1);
    }
}

// ---------------------------------------------------------------------------

fn main() {
    let raw_args: Vec<String> = env::args().collect();
    if raw_args.len() < 2 {
        die(
            "usage: swarm-bus <send|pull|offer|claim|ack|attempt|setstatus|watch|ready> [--k v ...]",
            64,
        );
    }
    let cmd = raw_args[1].clone();
    let args = parse_args(&raw_args[2..]);

    let result = match cmd.as_str() {
        "send" => cmd_send(&args),
        "pull" => cmd_pull(&args),
        "offer" => cmd_offer(&args),
        "claim" => cmd_claim(&args),
        "ack" => cmd_ack(&args),
        "attempt" => cmd_attempt(&args),
        "setstatus" => cmd_setstatus(&args),
        "watch" => cmd_watch(&args),
        "ready" => cmd_ready(&args),
        other => die(&format!("unknown command '{other}'"), 64),
    };

    if let Err(e) = result {
        eprintln!("swarm-bus: {e}");
        std::process::exit(1);
    }
}
