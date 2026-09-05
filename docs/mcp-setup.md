# MCP setup

MCP servers are declared in `.mcp.json` (project root). Each user enables
servers per-user in `.claude/settings.local.json`
(`enabledMcpjsonServers`).

## Configured servers

### github (`mcp__github__*`)

- Transport: HTTP (`https://api.githubcopilot.com/mcp/`).
- Use for structured GitHub access — issues, PRs, code and commit search,
  checks — instead of scraping with `WebFetch`. The `implement-issue` and
  `draft-ticket` skills use it, alongside the `gh` CLI.
- First use may prompt an OAuth authorization.

### playwright (`mcp__playwright__*`)

- Transport: stdio (`npx -y @playwright/mcp@latest`).
- A real browser for driving the running widget: navigate, click the map,
  fill the registration form, take screenshots. This is the **visual
  verification** path for a map-heavy UI with no automated test suite.
- Typical loop: run `pnpm dev` (Vite on :5174), point the Playwright MCP at
  `http://localhost:5174`, then interact and screenshot.

### cloudflare-docs (`mcp__cloudflare-docs__*`)

- Transport: HTTP (`https://docs.mcp.cloudflare.com/mcp`).
- Search Cloudflare docs (Pages, Workers, redirects, build settings). This
  app deploys to **Cloudflare Pages** (projects `sahajatlas` and
  `sahajatlas-design`). Reach for this instead of `WebFetch` for Cloudflare
  deployment, `_redirects`, or build-config questions.

### payloadcms-docs (`mcp__payloadcms-docs__*`)

- Transport: stdio (`mcpdoc`, via `uvx`), reading
  `https://payloadcms.com/llms.txt` as its docs source.
- Search PayloadCMS docs — collections, fields, hooks, access control, the
  REST and SDK client shapes SahajAtlasWeb consumes from SahajCloud. Reach
  for this instead of `WebFetch` for PayloadCMS API or config questions.

## Enabling

`.claude/settings.local.json` lists the enabled servers under
`enabledMcpjsonServers` (`github`, `playwright`, `cloudflare-docs`,
`payloadcms-docs`). If a server does not show up, check that it is listed
there and that `.mcp.json` is valid JSON.

## Preferences

- Prefer the **github MCP** over `WebFetch` for github.com content.
- Prefer the **Playwright MCP** over guessing whether a UI or map change
  works — drive the real widget and look.
- Prefer the **payloadcms-docs MCP** over `WebFetch` for PayloadCMS
  documentation.
- Permissions for `mcp__github__*` and `mcp__playwright__*` are pre-allowed
  in `.claude/settings.json`.
