# MCP setup

MCP servers are declared in `.mcp.json` (project root) and enabled per-user in
`.claude/settings.local.json` (`enabledMcpjsonServers`).

## Configured servers

### github (`mcp__github__*`)

- Transport: HTTP (`https://api.githubcopilot.com/mcp/`).
- Use for structured GitHub access — issues, PRs, code/commit search, checks —
  instead of scraping with `WebFetch`. The `implement-issue` and `draft-ticket`
  skills lean on it (alongside the `gh` CLI).
- First use may prompt an OAuth authorization.

### playwright (`mcp__playwright__*`)

- Transport: stdio (`npx -y @playwright/mcp@latest`).
- A real browser for driving the running widget: navigate, click the map,
  fill the registration form, take screenshots. This is the **visual
  verification** path for a map-heavy UI with no automated test suite.
- Typical loop: `pnpm dev` (Vite on :5173) → point the Playwright MCP at
  `http://localhost:5173` → interact and screenshot.

### cloudflare-docs (`mcp__cloudflare-docs__*`)

- Transport: HTTP (`https://docs.mcp.cloudflare.com/mcp`).
- Search Cloudflare docs (Pages, Workers, redirects, build settings). This app
  deploys to **Cloudflare Pages** (projects `sahajatlas` + `sahajatlas-design`), so reach for this
  instead of `WebFetch` when answering Cloudflare deployment / `_redirects` /
  build-config questions.

## Enabling

`.claude/settings.local.json` lists the enabled servers under
`enabledMcpjsonServers` (`github`, `playwright`, `cloudflare-docs`). If a server
isn't showing up, confirm it's listed there and that `.mcp.json` is valid JSON.

## Preferences

- Prefer the **github MCP** over `WebFetch` for github.com content.
- Prefer the **Playwright MCP** over guessing whether a UI/map change works —
  drive the real widget and look.
- Permissions for `mcp__github__*` and `mcp__playwright__*` are pre-allowed in
  `.claude/settings.json`.
