# Rebasing a stacked PR

The rule lives in the root `AGENTS.md` § Stacked PRs: this repo squash-merges, so once a
stacked branch's base lands, rebase the branch onto `main` — never merge `origin/main`
into it.

**To rebase a stacked branch:**

1. Size the real overlap first, so you know what to expect (usually a handful of files):

   ```bash
   git diff --name-only <your-branch-base> <your-branch> | sort > /tmp/mine
   git diff --name-only <your-branch-base> origin/main | sort > /tmp/theirs
   comm -12 /tmp/mine /tmp/theirs   # only these need hand-merging
   ```

2. Fetch `main` and rebase onto it:

   ```bash
   git fetch origin main
   git rebase --onto origin/main <old-base> <your-branch>
   ```

**If the rebase needs approval you don't have yet:**

1. Create a fresh branch off `origin/main`.
2. Cherry-pick your commits: `git cherry-pick <old-base>..<your-branch>`.
3. For every non-overlapping file, take your version wholesale:
   `git checkout <your-branch> -- <paths>`.
4. Hand-merge only the files the overlap check in step 1 found.
