---
name: finalize-pr
description: Finalize the current branch's PR — simplify, a single code-review, conditional security-review, the lean gate, push, create or refresh the PR, then watch CI and fix failures. User-invoked; also run by /implement-issue as its finalize step. Does not run unless explicitly triggered.
disable-model-invocation: true
effort: max
allowed-tools: Bash(*), Read, Edit, Write, Grep, Glob, Task
---

# Finalize PR

The reusable **ship pipeline**: take the current branch's accumulated local commits and ship them —
simplify → code-review → conditional security-review → lean gate → push → open/refresh the PR → get
CI green → report.

This is **phase 3** of the PR workflow (Implement → Adjust → **Finalize**) documented in `CLAUDE.md`.
`/implement-issue` runs this pipeline at the end of its implementation; you also run it directly
(`/finalize-pr`) once you're happy with a batch of local-only Adjust-phase commits — it's what turns
those un-pushed commits into one pushed PR and one CI run.

## Invocation

```
/finalize-pr
```

Operates on the current branch — no arguments. Run it from the feature branch you want to ship.

## Pipeline

The diff to review and ship is the **whole branch** — every commit since it diverged from `main`,
the range `origin/main...HEAD` — not just the last commit. Reuse that range throughout.

### 0. Pre-flight

```bash
git branch --show-current                 # must NOT be main
git status --short                        # working tree
git rev-list --count origin/main..HEAD    # commits to ship
```

- **Abort if on `main`** (or any shared branch).
- **Commit any pending working-tree changes first** — this is the end of the Adjust phase, so those
  uncommitted edits are part of what's shipping. If anything looks unrelated or unexpected, **stop
  and ask** rather than committing it. Never commit `.env.local` or any `sk.`/API secret.
- If there's **nothing ahead of `origin/main`** and the PR (if any) is already green, say so and
  exit — nothing to finalize.

### 1. Simplify

Run the `/simplify` slash command over the **entire branch diff** (`origin/main...HEAD`). Quality
pass for reuse / simplification / efficiency / altitude — it does **not** hunt for bugs.

- Let it apply fixes; review them and revert anything undesirable.
- If it changed anything, re-run the lean gate (step 4) and commit
  (`refactor: simplify per /simplify pass`). If it made no changes, continue.

### 2. Code review (`/code-review`) — single pass

**Dispatch one Task subagent** whose sole job is to run `/code-review` at **high** effort over the
full branch diff (`origin/main...HEAD`) and return its findings (severity + `file:line` + suggested
fix) — in an **isolated context** so its file reading doesn't bloat the main thread. Run it
**once**: not inline, and no second review pass afterwards — one pass is the contract.

- **Blocking**: triage every finding. Fix the valid ones (each as its own commit), then re-run the
  lean gate. Note any finding you dismiss with a one-line reason for the report.
- For a deeper pass you may note that the user can run the billed `/code-review ultra` (cloud,
  multi-agent) themselves — Claude cannot launch it.

### 3. Security review (conditional — only on risky paths)

This widget ships a **public bundle embedded in untrusted host pages**, so the risky surface is
client-side: the API-key/auth + data layer, the widget's host-prop trust boundary, untrusted-HTML
(XSS) sinks, dependencies, and anything touching secrets/env. Run a security review **only if** the
branch diff touches one of those:

```bash
# path-based: the auth/data layer, widget entry, HTML-rendering sinks, deps, secrets/build config
git diff --name-only origin/main...HEAD | grep -E \
  'src/config/api/|src/Widget\.tsx|src/lib/shape/lexical|src/components/organisms/EventPanel/|src/types/event|package\.json|(^|/)\.env|vite\.config\.ts'

# content-based: any newly-introduced HTML sink, wherever it lands
git diff origin/main...HEAD -- src | grep -E '^\+' | grep -E 'dangerouslySetInnerHTML|dompurify|DOMPurify|\.innerHTML'
```

- **Either matches** → run the security review over the diff. Prefer **dispatching the
  `security-reviewer` Task subagent** (this repo ships one, tuned for the public-bundle threat model)
  to keep the main thread lean; the `/security-review` command works too. Triage + fix its findings
  (each its own commit), then re-run the lean gate.
- **No match** → skip it and say so in the report ("no security-relevant paths changed").

### 4. Lean test gate

```bash
.claude/skills/pr-prep/check.sh          # lint + typecheck + test:run — the canonical lean gate
```

Fix and re-run on failure. CI (step 7) is the real gate — it adds the production build; don't
reproduce that locally unless debugging a red run (`pr-prep/check.sh --full` adds `pnpm build`).

### 5. Push

```bash
git push -u origin HEAD     # -u sets upstream on the first push; plain `git push` thereafter
```

Never force-push `main` or any shared branch; never `--no-verify`.

### 6. Open or refresh the PR

```bash
gh pr view --json number,url 2>/dev/null   # does a PR already exist for this branch?
```

Write the body to a session-unique temp file (preserves markdown) from `pr-template.md`:

```bash
BODY_FILE=$(mktemp -t pr-body.XXXXXX).md
# write the body to "$BODY_FILE", then:
```

- **No PR** → create it:
  ```bash
  gh pr create --title "<conventional commit title>" --body-file "$BODY_FILE" --base main
  ```
- **PR exists** → **refresh** its **title and description** so they reflect the final diff +
  verification, not the state when it was first opened. Re-derive both from the **current**
  `origin/main...HEAD` — Adjust-phase commits since the last push often change the story (a
  scope shift, a reverted or newly-added sub-feature, fresh verification), so don't reuse the
  originals:
  ```bash
  gh pr edit <pr> --title "<conventional commit title, re-derived>" --body-file "$BODY_FILE"
  ```
  Update the title whenever the branch no longer matches it (a feature dropped or added since
  the last push); keep it only if it's still accurate. Never leave a stale title or description
  from an earlier state.

### 7. Watch CI and fix (capped)

```bash
gh pr checks <pr-or-branch> --watch
gh pr checks <pr-or-branch>            # confirm final state
```

CI (`.github/workflows/ci.yml`) runs the **Lint, Typecheck & Build** gate (lint + typecheck +
test:run + build + ladle:build); the **Smoke** job runs separately against the Cloudflare preview.

- **Green** → report.
- **Red** → `gh run view <run-id> --log-failed`, diagnose, fix locally (re-run the relevant part of
  the lean gate), commit, push, re-watch.
- **Cap at 3 fix iterations.** If CI is still red after three rounds, **stop and summarize** the
  remaining failure(s) for the user instead of looping.
- A failure **pre-existing on `main`** (not caused by this branch) → fix it in this PR and note it,
  per `.claude/skills/pr-prep/SKILL.md`.

### 8. Report

- PR URL + final CI status (green, or the capped-out summary).
- Dismissed review findings (with the one-line reasons).
- Acceptance criteria / behaviour the user should verify manually (UI screenshots, map interaction —
  the node-only unit lane can't cover those).
- **Suggest `/reflect-session`** *only if* the session hit notable friction (repeated failed
  attempts, surprising library behaviour, tooling snags). Don't suggest it for a clean run.

## Hard rules

- **Never** force-push `main`/any shared branch; **never** `--no-verify`; **never** commit
  `.env.local` or any `sk.`/API secret.
- **Never** report success while CI is red.
- **Always** run `/simplify` and `/code-review` over the **full branch diff**, not just the last commit.
- **Always** run `/code-review` (and the conditional security review) via a **dispatched Task
  subagent**, never inline in the main thread.
- **One** code-review pass — no redundant second review.
- **Always** use `--body-file` (a `mktemp` path) for `gh pr create` / `gh pr edit`; always refresh a
  stale PR **title and** body to match the current `origin/main...HEAD`.
- **Cap** the CI fix-loop at 3 iterations, then hand back to the user.

## References

- PR body template: `pr-template.md`
- Lean / `--full` gate + pre-existing-failure handling: `.claude/skills/pr-prep/`
- 3-phase PR workflow: `CLAUDE.md` → "Git / PR workflow"
- Branch naming: `.claude/skills/implement-issue/branch-naming.md`
- Commit conventions (HEREDOC + `Co-Authored-By`): `.claude/skills/draft-ticket/conventions.md`, `CLAUDE.md`
