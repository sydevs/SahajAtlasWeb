# PR template

Use this for the body of `gh pr create --body-file "$BODY_FILE"` (write to a
`mktemp` path, never a fixed `/tmp` file).

```markdown
## Summary

[2-3 bullets on what changed and why. Focus on user-facing or behavior-level
outcomes, not implementation details.]

- [bullet 1]
- [bullet 2]

## Changes

[Optional. Only if non-obvious from the file list — e.g. multi-file refactors
where the structural change isn't apparent from individual diffs.]

- `src/components/organisms/Mapbox/layers.ts` — [what changes]

## Verification

- Lint: ✓ No errors (`pnpm lint`)
- Types: ✓ Clean (`pnpm typecheck`)
- Tests: ✓ Unit lane green (`pnpm test:run`)
- Build: ✓ Success (`pnpm build`) — or "N/A — no build-affecting changes"

## Manual / visual verification (optional)

[For UI / map changes that automated checks can't cover. Steps + screenshots
from the running widget.]

1. [step]

## Notes for reviewer

[Non-obvious decisions, alternatives considered, known follow-ups, areas needing
extra scrutiny.]

Closes #NNN

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## Title

Same as the issue title (`<type>(<scope>): <subject>`), or close to it.

## Avoid in PR descriptions

- ❌ Restating what each commit did (the commit list is right there)
- ❌ "This should fix the bug" — say what it does, not what you hope
- ❌ "Made some refactors" — be specific or omit
