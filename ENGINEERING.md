# ENGINEERING LOG

Append-only log of every structural change/movement to this repository's
source code: new files, moved/renamed/deleted files, dependency changes,
schema migrations, and architectural decisions. This is **not** a design
doc (see `PRD.md` for that) — it's a chronological record of what actually
happened to the source tree, so future work (by Claude or anyone else) can
see how the codebase got to its current shape without spelunking git log.

## How to add an entry

- One entry per meaningful change (a PR-sized unit of work, not every
  single file save).
- Newest entry at the top.
- Use the template below. Keep "Why" honest — if a change reverses an
  earlier decision, say which entry it reverses.
- Never record secrets (tokens, passwords, connection strings) here —
  reference the env var name only.

```
## YYYY-MM-DD — <short title>
**Type**: add | move | rename | delete | refactor | schema | dependency | decision
**Files**: path/one, path/two
**Why**: one or two sentences on the reason/context.
**Notes**: anything a future reader needs (gotchas, follow-ups, links to PRD section).
```

---

## 2026-09-08 — `/scan` command implemented (Strix pentest integration)
**Type**: add
**Files**: `src/commands/scan.js`, `src/services/strixScan.js`,
`sarifSummary.js`, `targetUrl.js`, `src/services/db.js` (scan-operator
functions), `src/admin/scanOperators.js`, `server.js`, `layout.js`,
`src/config/env.js`, `supabase-migrations/009_scan_operators.sql`,
`test/sarifSummary.test.js`, `test/targetUrl.test.js`, `.env`/`.env.example`
**Why**: implements the approved design in
`docs/superpowers/specs/2026-09-08-strix-scan-integration-design.md`.
**Notes**:
- **Access control, not target allowlisting**: per explicit user
  direction during brainstorming, `target` is a free-text URL — no
  pre-registration step. Authorization is entirely `interaction.user.id
  === env.ownerDiscordId || db.isApprovedScanOperator(...)`, checked in
  `scan.js` before anything else runs. New global (not per-guild) table
  `bot_scan_operators`, managed via a new admin page `/scan-operators`.
- **`env.js` bugfix in passing**: `STRIX_LLM_MODEL`/`STRIX_GEMINI_API_KEY`
  were already in `.env` from the earlier credential-split entry but had
  never actually been wired into the `env` object — `resolveAiConfig()`-
  style code reading `env.strixLlmModel` would have silently gotten
  `undefined`. Fixed as part of this change.
- **Single global scan slot**: `strixScan.js` holds one module-level
  `state`; a second `/scan` while one is running gets an ephemeral
  "already running" reply instead of queuing or running concurrently
  (resource-heavy: Docker sandbox + LLM calls).
- **Hard timeout added** (`STRIX_SCAN_TIMEOUT_MS`, default 20 min):
  directly motivated by the spike's observed failure mode — a single
  rejected LLM request retried for 7+ minutes before the agent even
  finished its first turn. `--max-turns` alone doesn't bound wall-clock
  time if individual turns hang, so `child.kill("SIGKILL")` fires
  independently on a `setTimeout`.
- **No autocomplete anywhere in this feature**: `mode` is a static
  `.addChoices()` option (server round-trip not needed — Discord
  resolves choices client-side), and `target` has nothing to suggest
  from since there's no registered list. `EmbedBuilder`/
  `AttachmentBuilder` are genuinely new to this codebase (confirmed via
  Explore before writing `strixScan.js` — grepped for zero prior usage).
- Run-directory discovery: Strix's own stdout prints `Output
  strix_runs/<name>` once a scan starts; `strixScan.js` regex-matches
  that line from the captured stdout stream rather than guessing the
  name (it isn't predictable in advance — includes a random suffix).
- Results posted via `channel.send()` (not `interaction.editReply`),
  since a scan can outlast Discord's 15-minute interaction-token
  window — this mirrors the same reasoning as `/remind`'s reminder
  delivery (also plain `channel.send`, not an interaction callback).
- Verified this session: `npm test` (35/35 passing), `npm run migrate`
  applied `009_scan_operators.sql`, `npm run register-commands`
  registered 12 global commands, bot restarted successfully, and
  `/scan-operators` was hit end-to-end through a real authenticated
  admin session (200 OK).
- **Not yet verified**: an actual `/scan` run through Discord itself —
  `OWNER_DISCORD_ID` is still blank in `.env` (added this session but
  not filled in), so nobody is currently authorized to invoke the
  command. Needs the operator's real Discord user ID before first use.

## 2026-09-08 — Correction: Gemini free-tier quota, switched to Flash Lite
**Type**: decision
**Files**: `.env` (untracked, gitignored), `.env.example`,
`docs/superpowers/specs/2026-09-08-strix-scan-integration-design.md`
**Why**: the previous entry's "free tier: 15 RPM / 1,500 req/day" figure
was from general documentation, not the user's actual account. The
user's real Google AI Studio quota dashboard (checked while setting up
`STRIX_GEMINI_API_KEY`) shows plain Flash models — including
`gemini-3.6-flash`, the default this project had picked — capped at
**5 RPM / 20 requests per day**. A single multi-turn Strix scan can
exhaust that on its own (the earlier spike needed 5 retries just to get
past one agent turn).
**Notes**: switched `STRIX_LLM_MODEL` default from
`gemini/gemini-3.6-flash` to `gemini/gemini-3.5-flash-lite` — same
account's quota dashboard shows Flash Lite variants (3.1 and 3.5) at
**15 RPM / 500 requests per day**, 25x the daily headroom, at some cost
to reasoning quality versus plain Flash. Not yet load-tested against a
real `/scan` run (the command itself isn't implemented yet — see the
design doc). If 500/day still proves too tight once `/scan` is actually
used, the next lever is enabling billing on the Google AI Studio
project (removes free-tier caps entirely) rather than downgrading
further to Gemma, which is unlikely to reason well enough for
pentesting tasks despite its much higher quota.

## 2026-09-08 — Strix pentest integration: spike findings + credential split
**Type**: decision
**Files**: `.env` (untracked, gitignored), `.env.example`; also
`../gemini-web2api/gemini_web2api.py` (a **separate sibling repo**, not
this one — noted here because the decision directly affects how this
bot will eventually call Strix)
**Why**: exploring a future `/scan` slash command that triggers
[Strix](https://github.com/usestrix/strix) (an autonomous AI pentest
agent) against the operator's own authorized targets, with results
posted back to Discord. Spiked whether gemini-web2api could serve as
Strix's own LLM backend (to avoid a second LLM cost) before committing
to any Discord-side design.
**Notes**:
- **Spike result: no.** A live scan against `https://cs.skorcard.app`
  (authorized, operator-owned) with `STRIX_LLM=openai/<model>` pointed
  at gemini-web2api's OpenAI-compatible endpoint failed 100% of the
  time with `502 upstream error: Gemini upstream rejected request:
  BardErrorInfo [1152]`.
- Root-caused in `../gemini-web2api`: the deployed `/v1/chat/completions`
  handler injected tool schemas using an injection-style prompt
  (`"[System instruction]: ... respond with \`\`\`tool_call..."`) that
  Gemini's web backend was rejecting. Fixed there (natural phrasing +
  actual retry-on-BardErrorInfo, previously nonexistent) and pushed to
  both of the user's deploy remotes (`origin` → api.support.duacincin.id
  and `muter`) — verified fixed for small/normal tool-calling payloads
  (a 3-tool test request now gets a clean 200).
- **But this doesn't solve it for Strix specifically**: Strix's actual
  root-agent system prompt is **~102,000 characters with 41 tools**.
  Re-tested against the same target with the fix live — still 100%
  `BardErrorInfo`, retried 5x every time, looped indefinitely. The
  rejection is evidently tied to raw payload size/complexity, not just
  prompt phrasing — no proxy-side fix realistically solves this.
- **Decision**: Strix gets its own, separate LLM credential — the real
  Google AI Studio API (free tier: 15 RPM / 1,500 req/day on Flash
  models, no billing needed), **not** gemini-web2api. Added
  `STRIX_LLM_MODEL` (default `gemini/gemini-3.6-flash`, one of Strix's
  own recommended models) and `STRIX_GEMINI_API_KEY` to `.env`/
  `.env.example`, deliberately separate from `AI_API_KEY` — the
  Discord bot's own `/chat`/mention-trigger AI path is untouched and
  keeps using gemini-web2api as before. When the `/scan` command is
  actually implemented, it must set the spawned Strix process's env to
  `{STRIX_LLM: STRIX_LLM_MODEL, LLM_API_KEY: STRIX_GEMINI_API_KEY}` —
  explicitly not `LLM_API_BASE` (unlike the failed gemini-web2api
  experiment, the real Google API needs no base-URL override) and
  explicitly not reusing `AI_API_KEY`.
- No Discord-side `/scan` command exists yet — this entry covers only
  the spike findings and credential decision. The command itself
  (target allowlist, operator-only restriction, async job handling
  since scans can run long, result formatting) is unbuilt, pending a
  proper brainstorming pass whenever the user is ready to build it.

## 2026-09-08 — Phase 4 implemented: knowledge base, conversation viewer, feature toggles
**Type**: add
**Files**: `src/services/knowledge.js`, `src/admin/knowledge.js`,
`conversations.js`, `features.js`, `src/admin/server.js`, `guilds.js`,
`src/services/db.js` (knowledge/conversation-viewer/disabled-commands
functions + a bugfix), `src/services/aiChatPipeline.js`,
`src/events/interactionCreate.js`,
`supabase-migrations/007_guild_feature_flags.sql`, `008_knowledge.sql`,
`test/knowledge.test.js`
**Why**: implements PRD §6 Phase 4 (Admin Dashboard Parity), completing
the roadmap in PRD §12. Went through `brainstorming` (bounded path)
with the user. Before designing the knowledge base, investigated a
sibling project the user pointed to (`../CSPORTAL`) that already has a
working "knowledge base" on gemini-web2api — turned out it uses **no
embeddings or retrieval at all**: it loads every curated KB row and
concatenates it verbatim into the system prompt on every request. This
directly overturned this project's own PRD §11 assumption that a
knowledge base would require a real Google embedding API key (bypassing
gemini-web2api, mirroring whatsapp-group-bot) — that path is **not**
needed; ported CSPORTAL's simpler pattern instead. User separately
approved building full per-guild command toggles (not deferred as
originally suggested).
**Notes**:
- **Knowledge base**: new `bot_knowledge` table (guild_id, title,
  content). `src/services/knowledge.js`'s `loadKnowledge()` fetches all
  of a guild's entries with a 30s in-memory cache (mirrors CSPORTAL's
  `aiknowledge.Loader`), `formatForPrompt()` joins them as `## Title\n
  content` blocks. Wired into `aiChatPipeline.js`: the block is
  appended to `SYSTEM_PROMPT` before every AI call, only when non-empty.
  **Explicitly not a RAG system** — no chunking, ranking, or relevance
  filtering, same limitation CSPORTAL accepted; only suitable for a
  small, curated KB (FAQ/rules), not large document corpora. CRUD via
  a new admin page per guild (`/guilds/:guildId/knowledge`).
- **Conversation viewer**: `/guilds/:guildId/conversations` lists
  channels with history (grouped from `bot_conversation_history` by
  `channel_id`, filtered by `guild_id`) and a detail page shows the last
  100 messages read-only. **Bugfix in passing**: `db.js`'s in-memory
  `saveHistoryTurn` fallback wasn't storing `guild_id` on each row (only
  `role`/`content`/`created_at`), which would have made the in-memory
  path for this feature silently return nothing — fixed to store
  `guild_id` too, matching the Supabase-backed schema.
- **Feature toggles**: `bot_guild_settings` gets a new
  `disabled_commands text[]` column (reusing the existing per-guild
  settings row rather than a new table, same as the allowlist column).
  The admin `/guilds/:guildId/features` page lists every command by
  **scanning `src/commands/*.js` live** (same technique as
  `scripts/register-commands.mjs`) rather than a hardcoded list, so it
  can't drift as commands are added/removed. Enforcement added to
  `interactionCreate.js`, right after command lookup and before
  execution — replies ephemeral "This command is disabled in this
  server" and returns, only for guild interactions (DMs skip the check).
- Verified this session: `npm test` (28/28 passing), `npm run migrate`
  applied `007_guild_feature_flags.sql`/`008_knowledge.sql`, bot
  restarted successfully, and all three new admin pages
  (`/features`, `/knowledge`, `/conversations`) were hit end-to-end
  through a real authenticated session against a real guild ID and
  returned HTTP 200.
- This closes out PRD §12's roadmap — all four phases are now
  implemented. Remaining open items are PRD §13's original open
  questions (already substantially resolved) and any future work the
  user identifies from actually using the bot.

## 2026-09-08 — Phase 3 implemented: poll, trivia, reminders, notes, summary
**Type**: add
**Files**: `src/commands/poll.js`, `trivia.js`, `remind.js`, `note.js`,
`summary.js`, `src/services/trivia.js`, `reminders.js`,
`src/services/duration.js` (refactor), `src/services/db.js` (reminders +
notes functions), `src/events/ready.js`, `src/events/interactionCreate.js`,
`supabase-migrations/005_reminders.sql`, `006_notes.sql`, `test/poll.test.js`,
`trivia.test.js`, `test/duration.test.js` (extended)
**Why**: implements PRD §6 Phase 3 (Utility & Engagement). Went through
`brainstorming` (bounded path) with the user; confirmed decisions: `/poll`
uses Discord's **native Poll API** (confirmed supported — installed
discord.js is 14.27.0, well past the version that added it) instead of a
custom button/vote system; `/trivia` is AI-generated multiple-choice with
button voting, first correct answer wins, no lockout on wrong guesses;
`/remind` persists to Supabase with a periodic sweep so reminders survive
a bot restart; `/note` lets any member add/list, but delete is
restricted (in code, not via Discord's permission system) to the note's
author or a Moderate-Members-permission holder.
**Notes**:
- **`/poll`**: `interaction.reply({ poll: { question, answers, duration,
  allowMultiselect } })` — no custom vote-counting code at all; Discord
  handles voting UI, tallying, and expiry natively.
- **`/trivia`**: `src/services/trivia.js` generates a question via a
  one-shot `chatCompletion()` call (bypasses `conversationHistory.js`
  entirely — this is not a continuing conversation) with a prompt
  demanding raw JSON, tolerantly parsed (strips markdown code fences)
  and validated before use. One active round per channel, tracked in an
  in-memory `Map` (ephemeral by design — losing an in-progress trivia
  round on restart is an acceptable simplification). Button clicks are
  dispatched from `interactionCreate.js`'s new `isButton()` branch
  (checked before the existing `isChatInputCommand()` branch) to
  `handleTriviaAnswer()`.
- **`/remind`**: reuses `duration.js`, but reusing the Phase 2
  `parseDuration()` (capped at Discord's 28-day timeout limit) would
  have silently capped long reminders — refactored `duration.js` to
  split the pure parser (`parseDurationMs`, uncapped) from the
  Discord-timeout-specific cap (`parseDuration`, still used by `/mute`
  unchanged). New table `bot_reminders`; `src/services/reminders.js`'s
  `startReminderSweep()` runs a `setInterval` (30s, `unref()`'d so it
  doesn't block process exit) started from `ready.js`, delivering due
  reminders and marking them regardless of delivery success (a deleted
  channel shouldn't cause infinite redelivery attempts).
- **`/note`**: new table `bot_notes`. Delete permission (author-or-
  moderator) is checked manually in `note.js` rather than via
  `setDefaultMemberPermissions`, since Discord's permission gate applies
  to the whole command, not per-subcommand, and `add`/`list` must stay
  open to everyone.
- **`/summary`**: fetches recent channel messages directly and calls
  `chatCompletion()` one-shot (same reasoning as trivia — not a
  continuing conversation), reusing `resolveAiConfig()` and
  `replyChunked()` from Phase 1.
- Verified this session: `npm test` (26/26 passing), `npm run migrate`
  applied `005_reminders.sql`/`006_notes.sql`, `npm run register-commands`
  registered 11 global commands, bot restarted and logged in
  successfully with the new code.
- Out of scope (per PRD §12, later phases): knowledge base/RAG, full
  admin dashboard parity (conversation viewer, live-reload UI polish).

## 2026-09-08 — Phase 2 implemented: moderation commands + AI rate limiting
**Type**: add
**Files**: `src/commands/warn.js`, `warnings.js`, `kick.js`, `mute.js`,
`unmute.js`, `src/services/duration.js`, `src/services/rateLimit.js`,
`src/services/db.js` (warnings functions), `src/commands/chat.js`,
`src/events/messageCreate.js`, `supabase-migrations/004_user_warnings.sql`,
`test/duration.test.js`, `test/rateLimit.test.js`
**Why**: implements PRD §6 Phase 2 (Moderation & Safety). Went through
`brainstorming` (bounded path — existing commands/events/services
pattern from Phase 1 already covered this shape of change) with the
user; key decisions confirmed: permission checks use Discord's native
`setDefaultMemberPermissions()` (no custom role table), `/mute` uses
Discord's native member timeout (not a custom Muted role), reaching
`WARNING_LIMIT` takes **no automatic action** (moderator decides
manually), and flood/cooldown control applies **only** to AI-trigger
messages (`/chat` + mention), not general chat moderation.
**Notes**:
- `/warn`, `/warnings`, `/kick`, `/mute`, `/unmute` added, each gated by
  `PermissionFlagsBits.ModerateMembers` or `KickMembers` at the Discord
  API level — Discord itself hides ungranted commands from members, so
  there's no manual permission-check branch in `execute()`.
- New table `bot_user_warnings` (guild_id, user_id, moderator_id,
  reason, created_at) follows the same `db.js` in-memory-fallback
  pattern as the Phase 1 tables (`addWarning`/`listWarnings`).
- `src/services/duration.js` — pure `parseDuration("10m"|"1h"|"1d")` →
  ms, capped at Discord's 28-day timeout limit (`MAX_TIMEOUT_MS`).
- `src/services/rateLimit.js` — `checkRateLimit(userId)` combines a
  per-user cooldown (`AI_COOLDOWN_MS`) and a sliding-window flood check
  (`FLOOD_LIMIT`/`FLOOD_WINDOW_MS`), in-memory only (resets on restart,
  acceptable for abuse-prevention state). Wired into both `chat.js` and
  `messageCreate.js` before the AI call — same shared-pipeline principle
  as Phase 1's `runAiChat`. Pure helpers (`isWithinCooldown`,
  `pruneWindow`) are exported separately so the logic is testable
  without touching Discord or timers.
- **Operational note**: the bot's existing Discord invite/permissions
  grant predates Kick Members/Moderate Members — confirm the bot's role
  has those permissions in each guild (Server Settings → Roles, or
  re-invite with an updated permission integer) or `/kick`/`/mute` will
  fail with a "Missing Permissions" error.
- Verified this session: `npm test` (17/17 passing), `npm run migrate`
  applied `004_user_warnings.sql`, `npm run register-commands`
  registered 6 global commands (`chat`, `warn`, `warnings`, `kick`,
  `mute`, `unmute`), bot restarted and logged in successfully with the
  new code.
- Out of scope (per PRD §12, later phases): image moderation (still
  blocked by gemini-web2api's lack of image input), polls/trivia/
  reminders/notes/summary, knowledge base/RAG, full dashboard parity.

## 2026-09-08 — Fix: duplicated /v1 in gemini-web2api request URL
**Type**: refactor
**Files**: `src/services/geminiClient.js`, `test/geminiClient.test.js`, `PRD.md` (§9, §8)
**Why**: first live end-to-end test (`/chat` in Discord) failed with the
bot's graceful error message. Root cause: `chatCompletion()` built the
request URL as `${baseUrl}/v1/chat/completions`, but the user's
`AI_BASE_URL` (`https://api.support.duacincin.id/v1`) already includes
the `/v1` prefix — same convention as whatsapp-group-bot's `AI_BASE_URL`.
Result was a request to `.../v1/v1/chat/completions` → 404 from
gemini-web2api. Confirmed via a direct `fetch` test outside the bot
(bypassing Discord) that showed the 404, then confirmed the fix with the
same direct call returning `200` with a real Gemini reply.
**Notes**: PRD §9's "Integration Contract" originally stated the
endpoint as `{AI_BASE_URL}/v1/chat/completions`, contradicting its own
§14 example value (`AI_BASE_URL=... e.g. https://.../v1`) — both PRD and
code are now corrected to the single convention: **`AI_BASE_URL` always
includes `/v1`; the client appends only `/chat/completions`**. Added a
regression test asserting the exact request URL so this can't silently
regress. Verified live after the fix: bot logged in successfully
("Logged in as DuaCincin AI Assistant#3066") and the direct gemini-web2api
call returned a real completion.

## 2026-09-08 — Phase 1 implemented: bot skeleton + AI chat + admin v0
**Type**: add
**Files**: `package.json`, `.env.example`, `src/config/*`, `src/services/*`,
`src/commands/chat.js`, `src/events/*`, `src/admin/*`, `src/index.js`,
`scripts/register-commands.mjs`, `scripts/run-migration.mjs`,
`supabase-migrations/001..003_*.sql`, `test/*`
**Why**: implements PRD §6 Phase 1 (Foundation + AI Chat) and §12 roadmap
row 1. Planned via Claude Code's plan mode (a `Plan` subagent produced the
file-by-file design; the `writing-plans` skill referenced by the
`brainstorming` skill turned out not to be installed in this environment,
so native plan mode was used as the equivalent gate instead).
**Notes**:
- **Structure**: `src/commands/*.js` and `src/events/*.js` are
  auto-loaded by directory scan in `src/index.js` — commands are matched
  by their exported `data.name`, events by filename (e.g. `ready.js` →
  `"ready"` event, `once: true` export controls `client.once` vs
  `client.on`). Adding a new command/event later is just adding a file,
  no registration list to maintain.
- **Shared AI pipeline**: both `/chat` (`src/commands/chat.js`) and the
  mention-trigger (`src/events/messageCreate.js`) call the same
  `runAiChat()` in `src/services/aiChatPipeline.js` — one code path for
  the AI call, per PRD §6/§8, not two divergent implementations.
- **`db.js` in-memory-fallback pattern** (`src/services/db.js`): every
  exported function (`fetchHistory`, `getAllowlist`,
  `getGlobalAiSettings`, etc.) branches internally on whether a Supabase
  client was constructed; callers (`conversationHistory.js`,
  `channelAllowlist.js`, `src/admin/*`) never null-check anything. This
  differs slightly from whatsapp-group-bot's pattern, where
  `database = ... : null` is exported and every *caller* checks it — here
  the null-check is pushed one layer down into `db.js` itself, so a
  Supabase outage or unset env vars degrades silently everywhere at once.
- **Defer-then-edit pattern**: `chat.js` calls `interaction.deferReply()`
  before the AI call (gemini-web2api latency can exceed Discord's 3s
  interaction window), then `editReply`/`followUp` via
  `src/services/discordReply.js`'s chunking helper, which also handles
  Discord's 2000-char message limit for both the slash-command and
  mention-trigger paths.
- **`resolveAiConfig()`** (`src/services/geminiClient.js`) reads the
  admin dashboard's DB-stored overrides fresh on every call and falls
  back to `.env` — live model/base-URL/API-key changes from `/settings`
  take effect without a redeploy, per PRD §5/§9.
- **Admin dashboard v0** (`src/admin/*`): single hardcoded
  admin/password pair from env (`ADMIN_USERNAME`/`ADMIN_PASSWORD`), no
  bcrypt/DB-backed multi-admin table yet (unlike WA bot's
  `adminUsers.js`) — explicitly a Phase 1 simplification; revisit before
  exposing this dashboard beyond a trusted operator.
- **Testing**: `node --test` (zero new dependency) covers
  `geminiClient.js` (request shape, success/error/network-failure paths
  via a mocked `fetchImpl`) and `conversationHistory.js`'s pure
  `trimToLimit()`. All 8 tests pass (`npm test`).
- **Verified end-to-end this session**: `npm install` succeeded; `npm
  run register-commands` successfully registered `/chat` globally via
  Discord's REST API (proves `DISCORD_TOKEN`/`DISCORD_CLIENT_ID` are
  valid); `npm start` connected to the Discord Gateway with a valid
  token but was **rejected with "Used disallowed intents"** — the
  `MESSAGE_CONTENT` privileged intent (needed for mention-trigger, PRD
  §11) must be enabled manually in the Discord Developer Portal (Bot →
  Privileged Gateway Intents) before the bot can fully boot. This is a
  one-time manual step, not a code defect.
- Supabase schema (3 tables: `bot_conversation_history`,
  `bot_guild_settings`, `bot_global_ai_settings`) has not yet been
  applied against the real database — `npm run migrate` has not been run
  this session (`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are still
  unset in `.env`, so the bot currently runs in in-memory-only mode; only
  `SUPABASE_DB_URL`, used solely by the migration script, is set).
- Out of scope for this entry (deferred to later phases per PRD §12):
  moderation commands, flood control enforcement, polls/trivia/
  reminders/notes/summary, knowledge base/RAG, full dashboard parity.

## 2026-09-08 — Supabase pooler connection configured for migrations
**Type**: decision
**Files**: `.env` (untracked, gitignored), `.gitignore`, `PRD.md` (§13 Open Questions)
**Why**: user supplied a dedicated Supabase Postgres pooler connection
string to run schema migrations against, resolving PRD Open Question #1
(dedicated vs. shared-with-WA-bot Supabase project).
**Notes**: stored as `SUPABASE_DB_URL` in `.env`, which is git-ignored.
No migration SQL has been written yet (`supabase-migrations/` does not
exist yet) — schema design is Phase 1 work per the roadmap in PRD §12.
Still need to confirm this project is not shared with whatsapp-group-bot
before running migrations, to avoid table-name collisions.

## 2026-09-08 — Project bootstrapped: PRD written
**Type**: add
**Files**: `PRD.md`, `.gitignore`
**Why**: kickoff of the Discord bot project. Ran through the
`brainstorming` skill (architectural path) with the user: explored
`../whatsapp-group-bot` (architecture pattern to follow) and
`../gemini-web2api` (the AI backend this bot integrates with), then
converged on a modular (non-monolith) structure, slash-commands +
mention-trigger interface, Node.js/discord.js/Supabase/Express stack, and
a 4-phase roadmap.
**Notes**: no source code exists yet — `src/`, `commands/`, `services/`
etc. described in PRD §7 are not created. This repo is not yet a git
repository (no `.git/` present as of this entry). Key open questions
remain in PRD §13 (which gemini-web2api instance to point at, bot
branding/token, image-moderation alternative).
