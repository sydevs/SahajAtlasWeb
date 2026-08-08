---
name: finalize-pr
description: Finalize the current branch's PR — simplify, a single code-review, conditional security-review, the lean gate, a documentation-sync commit, push, create or refresh the PR, then watch CI and fix failures. User-invoked; also run by /implement-issue as its finalize step. Does not run unless explicitly triggered.
disable-model-invocation: true
effort: max
allowed-tools: Bash(*), Read, Edit, Write, Grep, Glob, Task
---

# Finalize PR

The reusable **ship pipeline**: take the current branch's accumulated local commits and ship them —
simplify → code-review → conditional security-review → lean gate → update docs → push → open/refresh the PR → get
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
client-side: the API-key/auth + data layer, the widget's host-prop trust boundary, the guards that
decide where a data-driven `href` may point, untrusted-HTML (XSS) sinks, the stylesheet we inject
into somebody else's `<head>`, the host's privacy opt-outs, dependencies, and anything touching
secrets/env. Run a security review **only if** the branch diff touches one of those:

```bash
# path-based: auth/data layer, widget + app entry + host-fragment routing, href/HTML sinks,
# the injected stylesheet and its scoping, privacy + reporting seams, deps + patches, secrets/build
git diff --name-only origin/main...HEAD | grep -E \
  'src/config/api/|src/types/event|src/Widget\.tsx|src/App\.tsx|src/lib/shape/hash|src/lib/shape/lexical|src/lib/shape/path|src/lib/shape/href|src/components/atoms/Link/|src/components/organisms/EventDetails/|src/styles/|src/lib/scope|scripts/[^/]*css|postcss\.config\.js|src/config/privacy|src/lib/report|package\.json|pnpm-lock\.yaml|patches/|(^|/)\.env|vite\.config\.ts'

# content-based: any newly-introduced HTML sink, wherever it lands
git diff origin/main...HEAD -- src | grep -E '^\+' | grep -E 'dangerouslySetInnerHTML|dompurify|DOMPurify|\.innerHTML'
```

**Widen that list deliberately, never maximally** — a trigger that fires on everything stops being
read, at which point it is worth no more than one that never fires. Each entry is somewhere a change
reaches a host page's visitors, and most are here because something got through: `shape/path` +
`shape/href` + `atoms/Link/` hold the same-origin/scheme guard (`//evil.com` walked past an
`href.startsWith('/')` check in #100 — on a branch this grep did **not** match, which is why it was
widened); `shape/hash` picks HashRouter vs MemoryRouter from the host page's own fragment, an
untrusted input choosing a branch (#92); `src/styles/` + `lib/scope` + the PostCSS scoping script and
config keep our injected stylesheet off the host's DOM (#91, #104); `config/privacy` + `lib/report`
decide what leaves the visitor's browser at all (#95, #108). `pnpm-lock.yaml` and `patches/` are the
supply-chain pair — the transitive bump that never touches `package.json`, and arbitrary code applied
to a dependency (which is why `patches/vaul@1.1.2.patch` exists at all).

**The module entries are deliberately unanchored, so a spec travels with its module** — the
`src/lib/shape/path` entry matches `path.test.ts` as well as `path.ts`. That matters because several
of these guards are enforced by an assertion rather than by a reader: `href.test.ts` pins the JSX
anchor inventory to exactly three components (`atoms/Link/`, `atoms/Button/`, `molecules/ActionRow/`)
and fails if any of them stops calling `isSafeHref`; `path.test.ts` pins `//evil.com` and the
tab/LF/CR forms. Deleting one of those assertions is precisely the diff worth seeing.

So prefer **adding the assertion over adding the path** — a red unit lane is faster and surer than a
review. That is why `src/config/i18n-options.ts` is deliberately absent: its one privacy property,
`caches: []` (it must never write `i18nextLng` onto the host's origin, #95), is asserted in
`i18n-options.test.ts`.

- **Either matches** → run the security review over the diff. Prefer **dispatching the
  `security-reviewer` Task subagent** (this repo ships one, tuned for the public-bundle threat model)
  to keep the main thread lean; the `/security-review` command works too. Triage + fix its findings
  (each its own commit), then re-run the lean gate.
- **No match** → skip it and say so in the report ("no security-relevant paths changed").

### 4. Lean test gate

```bash
.claude/skills/pr-prep/check.sh          # lint + typecheck + test:run — the canonical lean gate
```

Fix and re-run on failure. CI (step 8) is the real gate — it adds the production build; don't
reproduce that locally unless debugging a red run (`pr-prep/check.sh --full` adds `pnpm build`).

### 5. Update documentation

Sync the documentation the branch's changes affect, committed as the **final
commit before pushing** (docs ship with the code, not in a follow-up PR). Sweep
the branch diff (`origin/main...HEAD`) for what changed and update:

- **`CLAUDE.md`** + **`.claude/docs/*`** — architecture, deploy, environment,
  data-layer, or workflow facts the diff alters.
- **`.claude/rules/*`** — the path-scoped rule for any subsystem the diff touched
  (map, components, data-layer, i18n/state, tests).
- **`.claude/skills/*`** — any skill whose workflow the change alters (a renamed
  script, a changed gate command, a new/removed step in the PR pipeline).
- **`DESIGN_SYSTEM.md` / `STORYBOOK.md`** for component/story conventions; setup
  docs / `README` for new commands, env vars, or scripts.
- Inline examples (e.g. `demo.html`) and JSDoc/comments referencing anything the
  diff renamed, removed, or re-flagged — grep the diff for stale references.

Commit it on its own (`docs: <what changed>`). If the update touched lintable
files, re-run the lean gate (step 4). If the branch genuinely affects no docs,
say so in the report (step 9) rather than skipping silently.

### 6. Push

```bash
git push -u origin HEAD     # -u sets upstream on the first push; plain `git push` thereafter
```

Never force-push `main` or any shared branch; never `--no-verify`.

### 7. Open or refresh the PR

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

### 8. Watch CI and fix (capped)

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

### 9. Report

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
- **Always** commit a **documentation sync as the final commit before pushing** (step 5) — update
  `CLAUDE.md`, `.claude/docs/*`, `.claude/rules/*`, and any example the diff affects; or state in the
  report that no docs are affected.
- **Always** use `--body-file` (a `mktemp` path) for `gh pr create` / `gh pr edit`; always refresh a
  stale PR **title and** body to match the current `origin/main...HEAD`.
- **Cap** the CI fix-loop at 3 iterations, then hand back to the user.

## References

- PR body template: `pr-template.md`
- Lean / `--full` gate + pre-existing-failure handling: `.claude/skills/pr-prep/`
- 3-phase PR workflow: `CLAUDE.md` → "Git / PR workflow"
- Branch naming: `.claude/skills/implement-issue/branch-naming.md`
- Commit conventions (HEREDOC + `Co-Authored-By`): `.claude/skills/draft-ticket/conventions.md`, `CLAUDE.md`
