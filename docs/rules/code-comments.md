---
description: When a code comment earns its place, and which comments must never be deleted.
---

# Code comments

<!-- canonical:start — synced from claude-workflow/docs/code-comments.md. Edit there, not here. -->

- **Default to no comment.** Code shows *how*. A comment earns its place only by carrying *why* — a
  non-obvious constraint, a deliberate deviation, a gotcha, a workaround, or the reason a simpler
  version is wrong.
- **Never narrate the code.** No "loop over the users", no restating a name, a type or a signature,
  no `} // end if`.
- **Never narrate the change.** No "updated to", "as requested", "fixed the off-by-one". A comment
  must read correctly to someone who opens the file fresh and never saw the diff. Change context
  belongs in the commit message.
- **Never point at a moving target.** A spec section, a requirements doc, a design doc — all get
  superseded. Encode the substance instead. A ticket number, an RFC, a permalink, or a maintained
  doc at a stable path stays fine as a breadcrumb.
- **Apply the razor to every comment you keep, not only to the ones you cut.** "Carries a real
  *why*" and "is worded minimally" are separate judgements. A genuine *why* can still be three times
  too long. A five-line block rarely survives intact.
- **A one-line summary on a public function or endpoint is fine.** Restating a single clear line
  never is.
- **Never delete a tool directive, a `⚠` line, a cross-repo sync pointer, or a `#NNN` breadcrumb.**
  Directives change what a compiler, linter or formatter does. `⚠` is this workspace's own
  load-bearing marker. Nothing but prose enforces the couplings between these five repos.

TODOs are fine and need no issue ID. A TODO is a marker, not a substitute for the work.

<!-- canonical:end -->

## Carve-outs for this repo

This repo had a hand comment sweep in #197. What remains is mostly already minimal. Compress, do
not clear-cut.

- **`src/mocks/regions.ts` holds 27 trailing `// prettier-ignore`**, each keeping one region literal
  on a single line. Delete them and the next format run explodes the file.
- **`jsx-sort-props` autofix moves props and leaves comments where they sat.** In #161 it swapped a
  note for `measureAgainst` onto `handleOnly`, and lint stayed green. Never edit a comment inside a
  JSX opening element. Re-read the block after `--fix`.
- **`src/lib/brand.test.ts` reads raw file text**, comments included, and fails if a visitor-facing
  brand name appears in seven named copy files (#156). It fired once on a comment reflowed onto one
  line. The hyphenated form is safe. The spaced form is not.
- **Keep each lint ignore narrow and commented** (`docs/rules/mapbox.md`).
- Ladle renders a story's leading JSDoc as its description.
