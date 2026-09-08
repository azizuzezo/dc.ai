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
