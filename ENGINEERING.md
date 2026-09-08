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
