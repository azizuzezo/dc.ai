# Design — `/scan` Strix Pentest Integration

Status: Approved (pending user review of this doc)
Date: 2026-09-08

## 1. Overview

Add a `/scan` Discord slash command that triggers
[Strix](https://github.com/usestrix/strix) — an autonomous AI
penetration-testing agent, already installed locally via its CLI — against
a URL the invoking user supplies, and posts a results summary back to the
Discord channel when the scan finishes.

This follows a spike (documented in `ENGINEERING.md`, "Strix pentest
integration: spike findings + credential split") that established: Strix
cannot use gemini-web2api as its LLM backend for real scans (payload too
large, gets rejected by Gemini's web backend); it needs its own dedicated
credential pointed at the real Google AI Studio API
(`STRIX_LLM_MODEL`, `STRIX_GEMINI_API_KEY`, already added to `.env`).

## 2. Goals

1. Let the bot operator (and any operator they explicitly approve) launch
   a Strix scan against a URL, from Discord, without touching a terminal.
2. Keep this capability restricted to explicitly-trusted individuals —
   this bot is multi-guild/publicly-invitable, and running an autonomous
   pentest agent is a legal/authorization-sensitive action (per Strix's
   own README warning: only scan systems you own or have explicit written
   permission to test).
3. Get results back into Discord in a readable form (summary + raw
   report attached) without needing to SSH into the host machine.
4. Don't let a stuck/misbehaving scan (we saw this firsthand in the
   spike — a rejected request looping for 7+ minutes per agent turn)
   block the bot or run indefinitely.

## 3. Non-Goals

- No target pre-registration/allowlist — the invoking user pastes the
  URL directly in the command (explicit user decision, overriding an
  earlier draft of this design that proposed one). Authorization is
  enforced entirely at the **who can run `/scan`** layer (§4), not at
  the target layer.
- No multi-scan concurrency — one scan at a time, globally, across all
  guilds (§6).
- No scan-history dashboard/UI beyond what's needed to see the current
  run's status. Past run artifacts remain on disk under `strix_runs/`
  for manual inspection; no admin page lists them (YAGNI — add later if
  actually needed).

## 4. Access Control

- New env var `OWNER_DISCORD_ID` — the bot operator's own Discord user
  ID. Always authorized.
- New table `bot_scan_operators` (`discord_user_id` primary key,
  `added_by`, `created_at`) — additional individually-approved users.
  Global, not per-guild (matches "trusted individual", not "guild role").
- New admin dashboard page `/scan-operators` (existing owner-only web
  login, same as every other admin page): add/remove approved Discord
  user IDs.
- `/scan`'s `execute()` checks `interaction.user.id === env.ownerDiscordId
  || await db.isApprovedScanOperator(interaction.user.id)` before doing
  anything else. Unauthorized users get an ephemeral "You're not
  authorized to use this command" — same failure shape regardless of
  guild, so it doesn't leak whether the command exists to other members
  (Discord's `setDefaultMemberPermissions` can't express "specific
  individuals," hence a manual check here rather than a permission bit).

## 5. Command Interface

```
/scan target:<url> mode:<quick|standard|deep>
```

- `target`: required string, the URL to scan. No format validation
  beyond "looks like a URL" (basic `new URL()` parse check) — trusting
  the operator's judgment per §3's non-goal.
- `mode`: required choice (`quick`/`standard`/`deep`), maps directly to
  Strix's own `--scan-mode` flag. No default — forces the operator to
  consciously pick, since `deep` (Strix's own default) is much
  more expensive/slow than what we tested in the spike.
- On invocation: reply immediately (non-deferred is fine — this is just
  an acknowledgment, not the scan result) with "Scan started: `<url>`
  (mode: `<mode>`). I'll post results here when it's done." then detach
  from the interaction — the actual result goes to the channel via
  `channel.send()`, not `interaction.editReply()`, because a scan can
  outlast Discord's 15-minute interaction-token window.

## 6. Execution

- `src/services/strixScan.js` owns a single module-level state object
  (`{ running: boolean, target, mode, startedAt, channelId }`) — one
  scan at a time, globally. A second `/scan` while one is running gets
  an ephemeral reply showing what's currently running, not queued.
- Spawns the CLI via Node's `child_process.spawn`:
  ```
  strix -n -t <target> -m <mode> --max-budget <STRIX_MAX_BUDGET_USD>
        --max-turns <STRIX_MAX_TURNS>
  ```
  with `env: { ...process.env, STRIX_LLM: env.strixLlmModel, LLM_API_KEY:
  env.strixGeminiApiKey }` — deliberately **not** setting `LLM_API_BASE`
  (the real Google API needs no override, unlike the failed
  gemini-web2api experiment) and deliberately not touching `AI_API_KEY`.
- New env vars: `STRIX_MAX_BUDGET_USD` (default `3`), `STRIX_MAX_TURNS`
  (default `20`), `STRIX_SCAN_TIMEOUT_MS` (default `1200000` / 20 min) —
  same caps used successfully in the spike, now configurable rather than
  hardcoded.
- **Hard timeout**: a `setTimeout(() => child.kill(), STRIX_SCAN_TIMEOUT_MS)`
  force-kills the process if it's still running at the deadline — added
  specifically because the spike observed a single stuck agent turn take
  7+ minutes retrying a doomed request; `--max-turns` alone doesn't bound
  wall-clock time if individual turns hang.
- Captures stdout+stderr to a buffer (also written to a log file) for
  the final report — Strix's non-interactive mode prints the final
  report as part of its own stdout mentioned in its `--help` text; no
  separate parsing of that report format is needed beyond attaching it
  raw.
- Strix also writes structured files to `strix_runs/<target-slug>_<id>/`
  — `findings.sarif` (industry-standard, used for the summary counts)
  and `run.json`. The run directory name isn't predictable in advance,
  so it's captured by matching Strix's own stdout line (`Output
  strix_runs/<name>`) via regex, same as observed in the spike.
- On process exit (success, failure, or forced timeout kill): read
  `findings.sarif` if it exists, build the Discord summary (§7), send
  it to the stored `channelId`, then reset the module state so the next
  `/scan` can run.

## 7. Result Delivery

Posted via `channel.send()` to the channel the scan was launched from:

- An embed: target URL, mode, duration, and a findings count broken
  down by SARIF severity level (`error`/`warning`/`note`, mapped to
  Critical/High-Medium/Low-Info for readability). If `findings.sarif`
  is missing or unparseable (e.g. the scan was killed by the timeout
  before producing one), the embed says so plainly instead of showing a
  zero count that could be misread as "no vulnerabilities found."
- Two file attachments, when they exist: `findings.sarif` (raw, for
  tools that consume SARIF) and a `scan.log` (the captured stdout,
  which contains Strix's own human-readable final report).

## 8. Error Handling

- Target fails basic URL parsing → ephemeral reply, no scan started.
- Not an approved operator → ephemeral reply, no information leakage
  about the command's existence/behavior.
- `strix` binary missing/spawn failure → caught, logged, channel gets a
  plain-text error message (not a raw stack trace).
- Non-zero exit with no `findings.sarif` → treated as a failed run,
  reported as such with whatever log tail is available, not silently
  swallowed.
- Timeout-killed run → reported explicitly as "timed out after Nm,
  partial results (if any) below" rather than looking like a clean
  completion.

## 9. Data Model

```sql
create table bot_scan_operators (
  discord_user_id text primary key,
  added_by text,
  created_at timestamptz not null default now()
);
```

Same in-memory-fallback pattern as every other table in `db.js`
(`isApprovedScanOperator`, `addScanOperator`, `removeScanOperator`,
`listScanOperators`).

## 10. Testing

- `parseSarifSummary(sarifJson)` — pure function, unit-tested with
  `node:test`: counts findings by level, handles missing/empty
  `runs[].results`, handles a malformed/non-SARIF JSON input gracefully
  (returns null rather than throwing, so the caller can fall back to
  "results unavailable").
- `isValidTargetUrl(input)` — pure function wrapping `new URL()`,
  unit-tested for valid/invalid inputs.
- The actual `child_process.spawn` / Discord-posting flow is verified
  manually (same approach as every prior phase) — mocking a real Strix
  run isn't worth the complexity for a single operator-only command.

## 11. Environment Variables (new)

```
OWNER_DISCORD_ID=
STRIX_LLM_MODEL=gemini/gemini-3.5-flash-lite   # already added; Flash Lite,
                                                # not plain Flash — plain
                                                # Flash's free tier is only
                                                # ~20 requests/day on newer
                                                # model versions (checked
                                                # against the user's real
                                                # account), which a single
                                                # multi-turn scan can exhaust
                                                # on its own. Flash Lite's
                                                # free tier is ~500/day.
STRIX_GEMINI_API_KEY=                      # already added
STRIX_MAX_BUDGET_USD=3
STRIX_MAX_TURNS=20
STRIX_SCAN_TIMEOUT_MS=1200000
```

## 12. Open Questions

None blocking — this is a single operator-only command with no
per-guild rollout concerns. If usage grows (more approved operators,
frequent scans), revisit whether single-global-concurrency (§6) is
still the right limit.
