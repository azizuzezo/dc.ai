# PRD — Discord AI Bot (Gemini-powered)

Status: Draft v1.0
Date: 2026-09-08
Owner: Aziz

## 1. Overview

A Discord bot that brings Gemini-powered conversational AI, moderation, and
community-engagement utilities into Discord servers (guilds). It follows the
same architectural spirit as the sibling project `whatsapp-group-bot`
(same owner, same AI backend), adapted to Discord's platform (slash
commands, guild/channel model, Discord API constraints) and re-scoped as a
**modular**, multi-guild-capable service rather than a single-file monolith.

The bot's AI capability is provided entirely through **gemini-web2api**, a
sibling project that exposes an OpenAI-compatible proxy in front of Gemini's
web interface. This bot is a pure consumer of that API — it does not talk to
Google's Gemini API directly.

## 2. Background

- `../whatsapp-group-bot` proves out the pattern: Node.js bot ↔
  gemini-web2api for AI replies, Supabase for persistence, an in-process
  Express admin dashboard, plus a large set of community/moderation
  features (polls, trivia, reminders, notes, flood control, image
  moderation).
- `../gemini-web2api` is a Python proxy that re-exposes Gemini's web
  frontend as `POST /v1/chat/completions` (OpenAI-compatible schema).
  Key facts that shape this PRD:
  - **Stateless per request** — no server-side session/thread ID. The
    caller must resend full conversation history every call.
  - **No image input support** — "image inputs in messages will be
    ignored" per its README. Any image-input feature (e.g. image
    moderation) cannot be built through this proxy as-is.
  - Optional API-key auth (`Authorization: Bearer <key>`), upstream
    retry/backoff and a 429 circuit breaker are already handled inside
    gemini-web2api — **the bot should not implement its own retry loop**
    against it.
- This is a new, empty project directory (`BOT Discord/`) — no existing
  source code to build on.

## 3. Goals

1. Let a Discord server's members converse with Gemini per-channel, with
   conversation memory, through a slash command and/or mention-trigger.
2. Provide the same category of community-management utilities as
   whatsapp-group-bot (moderation, polls, trivia, reminders, notes),
   reimplemented idiomatically for Discord.
3. Support **multiple Discord guilds** simultaneously, each with its own
   allowlist/settings, from one running bot process.
4. Give an operator an admin dashboard to configure per-guild AI settings,
   review conversations, and manage the knowledge base — mirroring
   whatsapp-group-bot's admin panel.
5. Keep an append-only engineering log (`ENGINEERING.md`) of every
   structural change to the source tree as the project evolves.

## 4. Non-Goals (v1)

- Image/vision-based moderation or image-input AI chat — **blocked by
  gemini-web2api's lack of image-input support**. Revisit only if
  gemini-web2api gains this capability, or a separate vision service is
  added later.
- Voice channel features (joining voice, transcription, TTS).
- Cross-posting / bridging messages between Discord and WhatsApp.
- Public bot-listing / verification for Discord's "public bot" badge
  (out of scope unless later requested).

## 5. Users & Use Cases

- **Guild member**: mentions the bot or uses `/chat` to ask Gemini a
  question in a channel; gets a contextual reply that remembers the
  recent conversation in that channel.
- **Guild moderator/admin**: uses moderation slash commands (warn/kick/
  mute), runs polls/trivia, sets reminders, manages notes.
- **Bot operator (Aziz)**: uses the admin web dashboard to see which
  guilds have the bot, toggle features per guild, view conversation logs,
  and adjust global AI settings (model, base URL, API key) without a
  redeploy — same live-override pattern as whatsapp-group-bot's
  `globalSettings`.

## 6. Functional Requirements (by phase)

### Phase 1 — Foundation + AI Chat
- Bot boots, registers slash commands, connects to Discord Gateway.
- `/chat <message>` slash command — reply generated via gemini-web2api,
  deferred if the AI call exceeds Discord's 3s interaction timeout.
- Mention-trigger: plain-text messages that @-mention the bot in an
  allowed channel also route to the same AI chat path.
- Per-channel conversation history: last N turns (config, default 10,
  matching whatsapp-group-bot's `AI_HISTORY_LIMIT`), persisted in
  Supabase with an in-memory cache.
- Per-guild allowlist of channels the bot is active in (default: all
  channels the bot can see, guild admin can restrict).
- Admin dashboard v0: list of guilds the bot is in, global AI settings
  (model / base URL / API key override), per-guild channel allowlist.

### Phase 2 — Moderation & Safety
- Text-based moderation commands: `/warn`, `/kick`, `/mute` (role-gated
  to Discord server admins/moderator role).
- Per-user/per-channel flood control (sliding window, mirrors
  whatsapp-group-bot's `recordFloodHit` pattern).
- AI-call cooldown per user to prevent spam-triggering the proxy.
- Image moderation: **deferred** — see Non-Goals. Track as an open
  question (§13) in case a workaround becomes viable.

### Phase 3 — Utility & Engagement
- `/poll` — create/vote/close a poll in a channel.
- `/trivia` — AI-generated trivia question/answer flow.
- `/remind` — schedule a reminder that DMs or posts back to the channel.
- `/note` — per-guild shared notes (add/list/delete).
- `/summary` — AI-generated summary of recent channel activity.

### Phase 4 — Admin Dashboard Parity
- Conversation viewer (read channel AI history from the dashboard).
- Knowledge base for AI answers: **not RAG** — no embeddings, no
  retrieval. Mirrors `../CSPORTAL`'s pattern instead of WA bot's:
  every curated knowledge entry for a guild is concatenated verbatim
  into the system prompt on each AI call. No Google embedding API key
  needed. Only suitable for a small, curated KB (FAQ/rules), not large
  document corpora.
- Live-reloadable global settings (no redeploy needed to change model/
  key/base URL).
- Multi-guild management UI (per-guild feature toggles, allowlist
  editing).

## 7. Technical Architecture

**Stack**: Node.js (ESM, no build step, no TypeScript) — consistent with
`whatsapp-group-bot` for shared team familiarity. `discord.js` v14 as the
Discord Gateway/Interactions client (the Discord-side equivalent of
Baileys). Supabase (Postgres) for persistence, with in-memory fallback if
Supabase env vars are unset (same degrade pattern as WA bot). Express for
the admin dashboard, run in the same process (mirrors WA bot's
`admin/bridge.js` shared-state pattern).

**Structure** (modular per-domain, not a monolith — chosen because full
feature scope + multi-guild would make a single file unmanageable, unlike
the WA bot's single 5,800-line `index.js`):

```
src/
  index.js                  # bootstrap: login, load commands/events
  commands/
    chat.js poll.js trivia.js remind.js note.js summary.js
    moderation/warn.js moderation/kick.js moderation/mute.js
    admin/*.js
  events/
    ready.js interactionCreate.js messageCreate.js guildCreate.js
  services/
    geminiClient.js          # calls gemini-web2api /v1/chat/completions
    db.js                    # supabase client + in-memory fallback
    conversationHistory.js   # per-channel history load/save/trim
    moderation.js            # flood control, warn/kick/mute logic
    polls.js trivia.js reminders.js notes.js
  admin/
    server.js auth.js bridge.js guilds.js conversations.js
    knowledge.js globalSettings.js
  config/
    env.js constants.js
supabase-migrations/
  *.sql
ENGINEERING.md
PRD.md
```

Each command file exports `{ data, execute }` (discord.js's standard slash
command shape) so commands are independently testable and loadable via a
directory scan, avoiding a large `if (command === ...)` chain.

## 8. Data Flow — AI Chat Request

1. User triggers AI chat (slash command `/chat` or mention in an allowed
   channel).
2. Event/interaction handler resolves guild + channel, checks the
   channel allowlist and per-user cooldown/flood-control state.
3. `conversationHistory.js` loads the channel's history (in-memory cache,
   falling back to Supabase), trimmed to the configured turn limit.
4. `geminiClient.js` builds `{model, messages: [...history, newMessage],
   temperature, max_tokens}` and `POST`s to
   `${AI_BASE_URL}/chat/completions` (note: `AI_BASE_URL` already
   includes the `/v1` prefix, e.g. `https://host/v1` — matches WA bot's
   convention) with `Authorization: Bearer ${AI_API_KEY}`. Non-streaming
   (matches WA bot's `callGeminiGenerate`).
5. For slash commands, the interaction is **deferred** immediately
   (`interaction.deferReply()`) before the AI call, since gemini-web2api
   latency can exceed Discord's 3-second initial-response window.
6. Response text is extracted; if it exceeds Discord's 2000-character
   message limit it is chunked across multiple messages/follow-ups.
7. Updated history (trimmed) is saved back to Supabase + cache.

## 9. Integration Contract — gemini-web2api

- Base URL and API key are configurable (`AI_BASE_URL`, `AI_API_KEY`),
  overridable live from the admin dashboard, same as WA bot.
- Endpoint used: `POST {AI_BASE_URL}/chat/completions`, where
  `AI_BASE_URL` already includes the `/v1` prefix (e.g.
  `https://host/v1`) — do not append `/v1` again in the client.
- Request: `{model, messages: [{role, content}, ...], temperature: 0.7,
  max_tokens: 1200}`. `tools`/`tool_choice` may be added later if
  function-calling features are needed (Phase 3+).
- Response: OpenAI-style `{choices: [{message: {role, content,
  tool_calls?}}], usage}`.
- No client-side retry — gemini-web2api already retries upstream with
  backoff and a 429 circuit breaker. On error (`!response.ok` or
  `data.error`), log and reply with a graceful failure message.
- No image input — never attach Discord image attachments to the
  `messages` payload; they will be silently ignored by the proxy.

## 10. Non-Functional Requirements

- **Reliability**: Supabase outage degrades to in-memory-only mode
  (history not persisted across restarts) rather than crashing.
- **Rate/abuse control**: per-user AI cooldown + sliding-window flood
  control, mirroring WA bot's `AI_COOLDOWN_MS` / `FLOOD_LIMIT` pattern.
- **Multi-guild isolation**: all state (history, settings, allowlist) is
  keyed by Discord guild ID + channel ID; no cross-guild data leakage.
- **Observability**: structured console logging with ISO timestamps
  (`[INFO]/[WARN]/[ERROR]`), same lightweight pattern as WA bot — no new
  logging dependency introduced unless a real observability need shows
  up.
- **Secrets**: all credentials via `.env` (dotenv), never committed.

## 11. Known Limitations & Risks

- **No image input via gemini-web2api** — image moderation and
  image-aware AI chat are not achievable through this backend today.
- **Discord privileged intents**: mention-trigger free-text chat requires
  the `MESSAGE_CONTENT` intent. This is fine under 100 guilds without
  Discord verification; if the bot grows past 100 guilds, verification +
  intent approval from Discord is required.
- **Shared upstream capacity**: gemini-web2api's `max_concurrent_requests`
  and 429 circuit breaker are shared across *all* callers of that proxy
  (including whatsapp-group-bot if pointed at the same instance) — a
  traffic spike on one bot can throttle the other.
- **Supabase project**: whether this bot uses a **new** Supabase project
  or a new schema inside the WA bot's existing project is not yet
  decided (see Open Questions).

## 12. Roadmap

| Phase | Scope | Depends on |
|---|---|---|
| 1 | Foundation + AI chat + admin v0 | gemini-web2api reachable, Supabase project chosen |
| 2 | Moderation & safety (text-only) | Phase 1 |
| 3 | Utility & engagement (poll/trivia/remind/note/summary) | Phase 1 |
| 4 | Admin dashboard parity (conversation viewer, knowledge base, live settings) | Phase 1–3 |

Each phase is planned and implemented separately (own implementation plan
via the writing-plans workflow) rather than as one large build.

## 13. Open Questions

1. ~~New Supabase project for this bot, or shared with WA bot?~~
   **Resolved 2026-09-08**: a dedicated Supabase Postgres connection
   (pooler) was provided for migrations. Credential stored in `.env` as
   `SUPABASE_DB_URL`, never committed — see `.gitignore`. Confirm this
   is a project separate from the WA bot's before running migrations,
   to avoid colliding table names.
2. Which gemini-web2api instance does this bot point at — the same
   Railway deployment the WA bot uses, or a dedicated instance to avoid
   shared rate-limit/concurrency contention?
3. Bot name/branding, and which Discord application/bot token to use.
4. Is an alternative image-moderation path wanted (e.g. a separate
   vision API) given gemini-web2api can't do it, or should image
   moderation simply stay out of scope?

## 14. Appendix — Expected Environment Variables (draft)

```
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
AI_BASE_URL=            # gemini-web2api base URL, e.g. https://.../v1
AI_API_KEY=
AI_MODEL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_URL=        # direct/pooler Postgres URL, migrations only
AI_HISTORY_LIMIT=10
AI_COOLDOWN_MS=8000
FLOOD_LIMIT=6
FLOOD_WINDOW_MS=10000
ADMIN_USERNAME=
ADMIN_PASSWORD=
ADMIN_PORT=
SESSION_SECRET=
```
