#!/usr/bin/env node

/**
 * Decides whether `ci.yml`'s smoke job publishes a preview for this push, or skips it quietly.
 *
 * It answers one question — did this push change anything the build or the smoke lane reads? —
 * and runs only once publishing is otherwise possible, so a missing secret stays loud and a fork
 * is never reached. The states that cannot publish at all (`queue`, `fork`, `no-credentials`)
 * are decided before the checkout, by the step above this one.
 *
 * ⚠ It FAILS TOWARD PUBLISHING. A refused compare, an empty one, one at the API's file cap, or
 * any other throw returns `publish`: a preview nobody needed costs a build, and a skip nobody
 * checked costs the lane's first invariant (`docs/testing.md`).
 *
 * ⚠ On a later push of the same pull request the skip also needs the PREVIOUS head's own smoke
 * check to have concluded `success`. Otherwise a docs-only push would carry a green check over a
 * red one for the same code. A cancelled or missing predecessor publishes as usual.
 *
 * Usage: `node scripts/plan-preview.mjs` — appends `reason=<publish|unread>` to `GITHUB_OUTPUT`.
 */

import { execFile } from 'node:child_process'
import { appendFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Paths no part of the app build, `public/`, or a smoke spec reads.
 *
 * ⚠ Named for what it means rather than for documentation: it also covers `.claude/`, which is
 * config and hook code. What makes the skip safe is that nothing CI runs reads any of it, not
 * that a human would call it prose.
 *
 * ⚠ Never add `tests/` or `.github/`. Changing either is what the smoke lane exists to run.
 * `plan-preview.test.ts` pins this both ways, against real paths from this repo.
 */
export const UNREAD_BY_CI = /(^|\/)[^/]*\.md$|^(docs|\.claude)\//

/**
 * The compare API returns at most this many files, and says nothing about the rest. At the cap
 * the answer is unknown, so it is not an answer.
 */
export const FILE_CAP = 300

/**
 * The smoke job's own check-run name, which the predecessor lookup keys on. A rename would
 * leave it finding none — safe, since every push then publishes, but it silently undoes the
 * skip. `ci-workflows.test.ts` pins this against `ci.yml`'s `name:`.
 */
export const SMOKE_CHECK_NAME = 'Smoke'

/** Every reason this script can emit. `ci-workflows.test.ts` holds it against the report step. */
export const REASONS = ['publish', 'unread']

/**
 * Whether every path is one `UNREAD_BY_CI` covers. An empty list is not.
 *
 * @param {string[]} files
 * @returns {boolean}
 */
export function allUnread(files) {
  return files.length > 0 && files.every((file) => UNREAD_BY_CI.test(file))
}

/**
 * `publish`, or `unread` when this push can be skipped quietly.
 *
 * @param {object} args
 * @param {(path: string) => Promise<any>} args.api Repository-scoped GitHub read.
 * @param {string} args.base The SHA this push is measured from.
 * @param {string} args.head The SHA to publish.
 * @param {string} [args.action] The `pull_request` action, for which `synchronize` is a re-push.
 * @returns {Promise<'publish' | 'unread'>}
 */
export async function planPreview({ api, base, head, action }) {
  try {
    const compare = await api(`compare/${base}...${head}`)
    const files = (compare?.files ?? []).map((file) => file.filename)

    if (files.length >= FILE_CAP) return 'publish'
    if (!allUnread(files)) return 'publish'
    if (action !== 'synchronize') return 'unread'

    const runs = await api(`commits/${base}/check-runs?check_name=${SMOKE_CHECK_NAME}`)
    const ours = (runs?.check_runs ?? []).filter((run) => run.app?.slug === 'github-actions')
    const last = ours
      .sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)))
      .at(-1)

    return last?.conclusion === 'success' ? 'unread' : 'publish'
  } catch {
    return 'publish'
  }
}

/**
 * A repository-scoped read of the REST API, through `gh`.
 *
 * `gh` rather than `fetch` so the credential is the one `GH_TOKEN` already carries for every
 * other API call in `ci.yml`, resolved the same way. An HTTP error exits non-zero and a
 * response past `maxBuffer` is killed, so either rejects and the caller publishes.
 *
 * @param {string} repo `<owner>/<name>`
 * @returns {(path: string) => Promise<any>}
 */
export function githubReader(repo) {
  return async (path) => {
    // A compare carries a patch per file, so the cap is far above any response that is still an
    // answer rather than the file cap being hit.
    const { stdout } = await execFileAsync('gh', ['api', `repos/${repo}/${path}`], {
      maxBuffer: 64 * 1024 * 1024,
    })

    return JSON.parse(stdout)
  }
}

async function main() {
  const reason = await planPreview({
    api: githubReader(process.env.GITHUB_REPOSITORY ?? ''),
    base: process.env.BASE ?? '',
    head: process.env.HEAD ?? '',
    action: process.env.ACTION,
  })

  // The line goes to the output file rather than to stdout, so a diagnostic printed beside it
  // cannot become a step output.
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `reason=${reason}\n`)
  console.log(`Smoke preview plan: ${reason}.`)
}

// Lets the spec import the decision without running it. `realpathSync` on both sides, because
// `process.argv[1]` keeps a symlink's path while `import.meta.url` resolves to the target file.
const invokedAs = process.argv[1]

if (invokedAs && realpathSync(invokedAs) === realpathSync(fileURLToPath(import.meta.url))) {
  await main()
}
