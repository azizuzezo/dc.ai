# Source

Copied unmodified from [JCodesMore/ai-website-cloner-template](https://github.com/JCodesMore/ai-website-cloner-template)
(`.agents/skills/clone-website/` + `.claude/commands/clone-website.md`), MIT licensed.

## Known mismatch with this project

This skill assumes a Next.js + shadcn/ui + Tailwind v4 scaffold (App Router pages,
`src/components/sites/...`, shadcn design tokens) and requires a connected browser
automation MCP tool (Chrome/Playwright/Puppeteer/Browserbase) to inspect live pages.

This project ([donatePublic.js](../../../src/admin/donatePublic.js),
[hostDashboard.js](../../../src/admin/hostDashboard.js), etc.) is plain
server-rendered HTML/CSS/vanilla JS via Express — no React/Next.js/shadcn. Using
this skill here means adapting its output conventions by hand (plain HTML/CSS
instead of `.tsx` components, no App Router routes) rather than following its
file-path instructions literally.
