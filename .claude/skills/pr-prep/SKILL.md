---
name: pr-prep
description: Pre-PR validation — runs the lean local gate (lint + typecheck + unit tests) by default, with --full to also reproduce the CI production build locally. Use before opening or marking a PR ready for review.
allowed-tools: Bash, Read, Grep
---

# PR Prep

Validates that the current branch is PR-ready.

| Gate                | Command                                        | Where                      |
| ------------------- | ---------------------------------------------- | -------------------------- |
| **Lean (default)**  | `pnpm lint && pnpm typecheck && pnpm test:run` | This skill, locally (fast) |
| **Full (`--full`)** | + `pnpm build && pnpm size`                    | Mirrors CI (`ci.yml`)      |

CI's gate is **lint + typecheck + test:run + build + size** (plus `ladle:build`,
a separate dependency-audit job, and a separate smoke job against the Cloudflare
preview). The lean gate runs the fast node-only unit lane; `--full` adds the
production build and the eager-payload budget that reads it. See
`.claude/rules/tests.md`.

## Quick start

```bash
.claude/skills/pr-prep/check.sh          # lint + typecheck + unit
.claude/skills/pr-prep/check.sh --full   # + pnpm build (CI parity)
```

## What to run before opening a PR

1. **Lint passes**: `pnpm lint`
2. **Types check**: `pnpm typecheck`
3. **Unit tests pass**: `pnpm test:run`
4. **Build + size** (for build-affecting changes — deps, vite/ts config, entry
   points): `pnpm build && pnpm size`
5. **Visual check** (UI / map changes): run `pnpm dev` and verify in the widget,
   or drive it with the Playwright MCP and capture a screenshot.

## When `--full` matters

- Dependency changes
- `vite.config.ts` / `tsconfig.json` changes
- Changes to entry points (`Widget.tsx`, `main.tsx`) or the web-component wiring
- Anything that could break the production bundle but not the dev server
- **Any new eager import.** The size budget only exists downstream of a build,
  so making a view or library load at startup is invisible to the lean gate and
  fails in CI instead.

## PR description format

Include a Verification section (CI is the source of truth):

```markdown
## Verification

- Lint: ✓ No errors
- Types: ✓ Clean
- Tests: ✓ Unit lane green
- Build: ✓ Success — or "N/A — no build-affecting changes"
```

## Handling pre-existing failures on `main`

If you find lint/type/build failures that already exist on `main`, fix them as
part of your PR (separate commit) and note it in the description. Confirm a
failure pre-exists by checking out `main` for the affected file and re-running
the relevant check.

## When NOT to use this skill

- During focused implementation — the PostToolUse hooks already run Prettier +
  ESLint + typecheck per edit. For ad-hoc checks run `pnpm lint` / `pnpm typecheck`
  directly.
- Use this skill specifically before opening / marking-ready a PR.
