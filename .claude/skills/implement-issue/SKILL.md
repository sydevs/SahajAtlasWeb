---
name: implement-issue
description: Implement and test a GitHub issue end-to-end. Reads the issue, plans the work, implements, validates lint/typecheck/build, and opens a PR. User-invoked only — does not run unless explicitly triggered.
argument-hint: '[issue-number]'
disable-model-invocation: true
effort: max
allowed-tools: Bash(*), Read, Edit, Write, Grep, Glob, Task
---

# Implement Issue

End-to-end implementation of a GitHub issue: read → plan → branch → implement →
validate → **finalize**. The finalize pipeline (simplify → review → push → PR →
green CI) is the shared `/finalize-pr` skill — phase 3 of the PR workflow.

## Invocation

```
/implement-issue 42
```

## Workflow

### 1. Verify clean working tree

```bash
git status
```

If there are uncommitted changes that aren't yours, **stop**. Ask the user
whether to stash or proceed. Never silently overwrite their work.

### 2. Fetch the issue

```bash
gh issue view "$ISSUE" --json number,title,body,labels,assignees
```

Read it fully. Identify acceptance criteria, files-affected, and whether UI
changes need manual/visual verification.

If the issue lacks acceptance criteria, **ask the user** what "done" looks like
before starting. Don't guess.

### 3. Plan the work

Lay out the plan in the conversation before touching code: files to
create/modify, order of changes, and how you'll verify (typecheck, and visual
check in the running widget via the Playwright MCP for UI changes). Ask the user
to confirm. Iterate until aligned.

**Working with the SahajCloud / Payload API?** If the issue touches the data
layer (`src/config/api/`, `src/types/`), refresh the synced contract **at the
start** so your zod schemas and `select`/`populate` objects match the live API:

```bash
pnpm types:cms       # committed TS types (payload-types.ts + response-types.ts)
pnpm types:openapi   # OpenAPI spec → src/types/payload/openapi.json (gitignored)
```

`types:openapi` needs `SAHAJCLOUD_DOCS_PASSWORD` in `.env.local` (see
`.claude/docs/environment.md`). The OpenAPI request/response schemas are the
source of truth for what a fetcher may `select` and what shape returns — but
**treat live runtime data as authoritative where it diverges**: a field the
contract marks required (non-null) can still come back `null` (e.g.
`schedule.firstDate_tz`), so lean toward `.nullish()` at the zod boundary and
fall back in consumers rather than trusting the generated type.

### 4. Create a branch

See `branch-naming.md`. Branch from latest `main`:

```bash
git fetch origin main && git checkout main && git pull && git checkout -b <type>/<slug>
```

### 5. Implement

One unit of change at a time. After each meaningful unit:

```bash
git add <files>
git commit -m "<conventional commit message>"
```

**Commit message rules** (see `.claude/skills/draft-ticket/conventions.md`):

- `<type>(<scope>): <subject>` — imperative mood, ≤ 70 chars, lowercase subject
- Reference the issue in the body: `Closes #42`
- Multi-line bodies via HEREDOC, ending with the Co-Authored-By line:

```bash
git commit -m "$(cat <<'EOF'
feat(map): cluster venues at low zoom

Closes #42

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

The Prettier + ESLint + typecheck PostToolUse hooks run automatically on each
edit; fix surfaced type errors before committing.

### 6. Validate

Run the lean local gate as you implement:

```bash
.claude/skills/pr-prep/check.sh          # lint + typecheck + test:run
.claude/skills/pr-prep/check.sh --full   # + production build (CI parity)
```

If anything fails: fix it, commit the fix separately, re-run. The full CI gate
runs in the finalize step — use `--full` locally only to debug a red run.

### 7. Finalize — run the ship pipeline

Implementation is done and validated. Now ship it: **follow every step in
`.claude/skills/finalize-pr/SKILL.md`** (simplify → review → push → PR → green
CI). On this first run it **creates** the PR.

Execute that skill's steps directly here; don't re-implement them in this file —
`finalize-pr` is the single source of truth, so the exact same pipeline runs
whether the user types `/finalize-pr` or `/implement-issue`.

### 8. Hand off to the Adjust phase

Once the PR is open and CI is green, report the PR URL, CI status, and any
manual-verification items (UI screenshots, map interaction). Then note that we're
now in the **Adjust phase**: further changes are committed locally as you go but
**not pushed**; run `/finalize-pr` again when the batch is ready to re-review and
re-run CI. See "Git / PR workflow" in `CLAUDE.md`.

## Hard rules

- **Never** force-push `main` or any shared branch
- **Never** skip hooks (`--no-verify`)
- **Never** commit secrets / `.env.local` / `sk.` tokens
- **Never** mark a PR ready while CI is red
- **Always** commit incrementally; never one monolithic commit at the end
- **Always** use `--body-file` (a `mktemp` path) for PR creation
- **Always** run the lean gate before pushing
- **Always** delegate finalize to `.claude/skills/finalize-pr/SKILL.md` — a
  **single** `/code-review` pass (subagent, never inline); no redundant second review
- **Always** wait for CI to finish and verify green before reporting

## Edge cases

- **Vague issue** — stop at step 3 and ask; don't invent acceptance criteria.
- **Existing PR** — `gh pr list --search "in:title <keyword>"` before branching;
  ask whether to extend or open new.
- **Tests** — a fast node-only unit lane (`pnpm test:run`, co-located
  `src/**/*.test.ts(x)`) runs on the gate; add specs for new logic/contracts
  (schemas, stores, helpers, the api interceptor). For behavioral/UI changes the
  lane can't cover, verify in the running widget (Playwright MCP) and describe
  the manual check in the PR. See `.claude/rules/tests.md`.

## References

- Finalize pipeline (phase 3): `.claude/skills/finalize-pr/SKILL.md`
- Branch naming: `branch-naming.md`
- Lean gate: `.claude/skills/pr-prep/`
- Repo conventions: `.claude/skills/draft-ticket/conventions.md`
- 3-phase PR workflow: `CLAUDE.md` → "Git / PR workflow"
