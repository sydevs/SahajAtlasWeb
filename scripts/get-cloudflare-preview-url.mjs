#!/usr/bin/env node

/**
 * Discover the Cloudflare Pages preview URL for a PR and wait until it's
 * reachable, then expose it as the `preview_url` GitHub Actions output — beside
 * a `preview_status` output naming WHICH path we took when that URL is empty.
 *
 * Cloudflare's GitHub integration surfaces the preview URL a few different ways
 * depending on account settings, so we probe several sources for the PR's head
 * SHA and take the first `*.pages.dev` we find:
 *   1. commit statuses        → status.target_url
 *   2. deployment statuses    → status.environment_url
 *   3. check runs             → the Cloudflare app's output summary
 *   4. the Cloudflare bot's PR comment body
 *
 * On THIS repo only source 3 is dependable, which is why it exists (PR #120).
 * Cloudflare here posts neither commit statuses nor GitHub deployments — both
 * queries come back empty — so discovery rested entirely on source 4, and the
 * bot's comment is best-effort. That made the smoke gate flaky by construction,
 * and since #99 made a missing preview HARD-FAIL a same-repo PR, the flake
 * presented as a red check on a good commit. The check run, meanwhile, is the
 * same object the "Cloudflare Pages: …" entry in the PR's check list comes from,
 * so it is present exactly when the deploy is.
 *
 * ## How long to wait (issue #132)
 *
 * The budget was 6 minutes, which was not a margin over the observed build time
 * — it WAS the observed build time. Measured across 86 successful
 * `Cloudflare Pages: sahajatlas` check runs (every commit on main plus every PR
 * head from #58 to #128), from the push landing to the run being posted:
 *
 *   p50 99s · p75 138s · p90 232s · p95 373s · max 453s
 *
 * So 360s sat BELOW the 95th percentile. The tail is queueing, not build size:
 * the slow samples cluster in windows where several PRs deploy at once (280 /
 * 301 / 373 / 393 / 397 / 453s are one such window), which is exactly how this
 * repo is worked. #124 came in at 397s and went red on a healthy commit.
 *
 * Hence 10 minutes: ~1.3× the slowest sample observed, with room for a deeper
 * queue than any measured here. A longer wait costs idle runner minutes and
 * nothing else, and it still fits inside the Smoke job's `timeout-minutes: 15`
 * alongside install and the specs — raise that cap too before raising this much
 * further. Note the clock starts when this STEP starts, which is 30-60s after
 * the push (33s on #124), so the real budget from the push is a little more
 * than the constant. Override with `PREVIEW_TIMEOUT_MS` rather than editing it.
 *
 * ## Why the wait is flat rather than adaptive
 *
 * There is no "Cloudflare is building" state to wait on. Verified over 230
 * Cloudflare check runs on this repo: every one was already `completed` when
 * first observable, with `started_at == completed_at` — the app posts the run
 * only once the deploy has finished. The check SUITE is not a substitute either:
 * GitHub pre-creates one per installed app on every push, so Cloudflare's sits
 * `queued` with zero runs, indistinguishable from the vercel / railway / sentry
 * suites belonging to apps that never post anything at all.
 *
 * Two signals do arrive earlier, and both are used as EVIDENCE (below) rather
 * than as grounds to wait longer:
 *   - the sibling `sahajatlas-design` check run, a median 41s (max 73s) ahead of
 *     the app's — too small a lead to be worth extending for, and `pick()`
 *     rightly refuses its host as a URL;
 *   - the Cloudflare bot's PR comment, which is ONE comment per PR edited in
 *     place per deploy, naming the short SHA it is currently deploying. It turns
 *     up at build start and stays for the whole build, so it establishes that a
 *     deploy exists while saying nothing about how much longer it needs.
 *
 * ## "Empty" is not one outcome (issue #132)
 *
 * If nothing usable is found we still emit an EMPTY preview_url and exit 0 —
 * discovery problems are reported here, never fatal. But the workflow cannot act
 * on "empty" alone, and only one of the ways to get there is a real failure, so
 * `preview_status` names which it was:
 *
 *   found       — a reachable URL for CF_PROJECT; preview_url is set
 *   unreachable — a URL for CF_PROJECT was posted but never answered a request
 *   pending     — a Cloudflare deploy exists for this SHA, no usable URL yet
 *   absent      — no Cloudflare signal at all for this SHA: the deploy did not
 *                 happen, and this is the genuine failure
 *   error       — missing env, or an unhandled throw
 *
 * `pending` / `unreachable` stay RED on a same-repo PR — a green Smoke check
 * that ran nothing is the exact hole #99 closed — but ci.yml tells the reader to
 * re-run rather than to investigate, and says how long we waited and what we
 * last saw. Whether an empty result is tolerable remains the WORKFLOW's call:
 * exiting non-zero here would turn a fork's expected skip into a red check.
 *
 * Env:
 *   GITHUB_TOKEN        (required) — read access to statuses/deployments/issues
 *   GITHUB_REPOSITORY   (auto in Actions) — "owner/repo"
 *   PR_HEAD_SHA         (required) — the PR head commit
 *   PR_NUMBER           (optional) — enables the PR-comment fallback
 *   CF_PROJECT          (optional) — the app's `*.pages.dev` HOST. Only a URL whose
 *                       hostname IS this host, or a subdomain of it, is accepted
 *                       (`pick`) — not a substring or slug test.
 *   PREVIEW_TIMEOUT_MS  (optional) — the discovery deadline, in MILLISECONDS.
 *                       Ignored unless positive; capped at MAX_TIMEOUT_MS.
 */

import { appendFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { report } from './_ci-output.mjs'

const token = process.env.GITHUB_TOKEN
const repo = process.env.GITHUB_REPOSITORY
const sha = process.env.PR_HEAD_SHA
const prNumber = process.env.PR_NUMBER
const project = process.env.CF_PROJECT || 'sahajatlas.pages.dev' // the app's *.pages.dev host (not the -design playground)

const shortSha = (sha || '').slice(0, 7)

// The project's own slug, for telling our check run ("Cloudflare Pages:
// sahajatlas") from the sibling playground's ("…: sahajatlas-design").
const projectSlug = project.split('.')[0].toLowerCase()

/** @param {string} [name] */
function runProject(name) {
  const match = /:\s*([a-z0-9-]+)\s*$/i.exec(name || '')

  return match ? match[1].toLowerCase() : null
}

// Cloudflare skips a build it has nothing to do for, and reports that as
// `neutral`. That is not a failed deploy.
const SUCCESS_CONCLUSIONS = new Set(['success', 'neutral', 'skipped'])

// 10 minutes — justified against 86 measured builds in the header comment, not
// against the feel of it. Overridable so a queue deeper than any yet observed is
// a workflow edit rather than a code change.
const DEFAULT_TIMEOUT_MS = 10 * 60_000

// Must stay under the Smoke job's `timeout-minutes` minus install + the specs.
const MAX_TIMEOUT_MS = 12 * 60_000

/**
 * Milliseconds. A bad override is IGNORED rather than honoured: read as seconds,
 * `PREVIEW_TIMEOUT_MS=600` would be a 0.6s deadline, one poll, and then a
 * confident "the deploy did not happen — investigate" about a build that had not
 * been given time to start. Wrong advice, stated loudly, is the failure mode this
 * whole ticket is about.
 * @param {string | undefined} raw
 */
export function timeoutFrom(raw, max = MAX_TIMEOUT_MS) {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS

  // Capped as well as floored: an override larger than the Smoke job's own
  // `timeout-minutes` gets the job CANCELLED, which skips the reporting step and
  // produces a red check carrying no message at all.
  return Math.min(parsed, max)
}

const TIMEOUT_MS = timeoutFrom(process.env.PREVIEW_TIMEOUT_MS)
const POLL_MS = 15_000

// Bound every request, so a hung socket cannot outlive the budget. undici's
// defaults are 300s, and the Smoke job's `timeout-minutes` cap CANCELS the job —
// which would skip the reporting step and leave a red check with no message at
// all, strictly worse than the timeout this ticket set out to fix.
const REQUEST_TIMEOUT_MS = 15_000

const PAGES_RE = /https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pages\.dev/gi

/** The `preview_status` output's vocabulary — see the header comment. */
export const STATUS = {
  found: 'found',
  unreachable: 'unreachable',
  pending: 'pending',
  failed: 'failed',
  absent: 'absent',
  error: 'error',
}

const startedAt = Date.now()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** @param {number} ms */
export function formatElapsed(ms) {
  const total = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(total / 60)

  return minutes ? `${minutes}m${String(total % 60).padStart(2, '0')}s` : `${total}s`
}

/**
 * Evidence strings quote API-supplied text (a check run's name) into the step
 * summary. Source 3 accepts a run whose NAME starts with "cloudflare pages" from
 * any installed app, not only Cloudflare's own, so treat that text as hostile:
 * flatten it to one line and cap it, since a newline is what turns a quoted name
 * into a forged summary line (`report()` only defangs a leading `::`).
 * @param {string} text
 */
export function note(text) {
  return String(text).replace(/\s+/g, ' ').trim().slice(0, 120)
}

/**
 * What the deadline expiring means, given what we saw before it did. Positive
 * evidence separates a slow deploy from an absent one — the whole point of the
 * second output, since only the latter is a real failure.
 * @param {{ lastUrl?: string | null, evidence?: string | null, failure?: string | null }} seen
 */
export function timeoutStatus({ lastUrl, evidence, failure }) {
  // A finished-and-failed deploy outranks everything: it is the one outcome
  // where waiting longer and re-running are both the wrong answer.
  if (failure) return STATUS.failed
  if (lastUrl) return STATUS.unreachable

  return evidence ? STATUS.pending : STATUS.absent
}

/**
 * One sentence a reader can act on, naming the last thing we saw. Only the three
 * timeout outcomes reach here — `error` carries its own message straight from
 * `fail()`. The elapsed wait is `emit`'s to print (it prefixes every line with
 * it), so repeating it here would say the same number twice in one sentence.
 * @param {string} status
 * @param {{ lastUrl?: string | null, evidence?: string | null, failure?: string | null }} ctx
 */
export function explain(status, { lastUrl, evidence, failure } = {}) {
  switch (status) {
    case STATUS.failed:
      return `the ${project} deploy for this commit FINISHED AND FAILED (${failure}) — re-running this job cannot help; read the Cloudflare deployment log.`
    case STATUS.unreachable:
      return `${lastUrl} was posted for this commit but never answered a request — the deploy exists, so re-run this job.`
    case STATUS.pending:
      return `a Cloudflare deploy exists for this commit (last seen: ${evidence}) but no ${project} preview URL had been posted — a slow deploy, so re-run this job.`
    default:
      return 'no Cloudflare signal of any kind for this commit — no check run, no deployment, no bot comment. The Pages build does not appear to have started.'
  }
}

function fail(msg) {
  console.error(msg)
  emit('', STATUS.error, msg)
  process.exit(0) // skip gracefully — never fail the job on discovery problems
}

/**
 * @param {string} url
 * @param {string} status
 * @param {string} [detail]
 */
function emit(url, status, detail) {
  const elapsed = formatElapsed(Date.now() - startedAt)

  // The OUTPUTS are the contract; the summary is presentation. Write them first:
  // if `$GITHUB_STEP_SUMMARY` is unwritable, `report()` throws, and with the
  // order reversed that throw would take the outputs with it — leaving ci.yml to
  // read an empty status and blame Cloudflare for a filesystem problem.
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `preview_url=${url}\npreview_status=${status}\n`)
  }

  report([
    '### Preview discovery',
    '',
    url
      ? `✅ \`${status}\` after ${elapsed} — smoke specs will run against ${url}`
      : `⚠️ \`${status}\` after ${elapsed} — ${detail}`,
  ])
}

async function gh(path) {
  try {
    const res = await fetch(`https://api.github.com${path}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    // A timed-out or failed probe is indistinguishable from "nothing there yet",
    // and the next poll will ask again — so it must not abort the whole run.
    return null
  }
}

// Only accept a URL for the configured project. Two Pages projects deploy per PR
// (the app + the `-design` Ladle playground), so a plain "first *.pages.dev"
// fallback would smoke-test the wrong deploy — return null (keep polling, then
// skip) rather than guess.
//
// Matched on the HOSTNAME, at a label boundary. A substring test accepts
// `https://evil-sahajatlas.pages.dev`, and `pages.dev` subdomains are
// first-come-first-served — so a URL scraped from source 4's PR comments could
// aim the smoke lane at a host somebody else controls and collect a green check
// that verified nothing. Source 4's Bot-author gate means that is not "anyone
// who can comment" (`user.type` is GitHub's word, not self-declared) — it takes
// a bot belonging to some installed GitHub App. `pick()` is what makes it not
// matter which. That mattered less when a missing preview merely skipped; ci.yml
// now hard-fails on one, which makes a hijacked URL the more attractive target.
export function pick(urls, host = project) {
  // `URL.hostname` is ASCII-lowercased; `host` comes from CF_PROJECT and is not.
  // Without this an uppercase in that variable matches nothing, discovery goes
  // home empty, and every same-repo PR turns red for a typo.
  const wanted = String(host).toLowerCase()

  return (
    urls.find((u) => {
      try {
        const { hostname } = new URL(u)

        return hostname === wanted || hostname.endsWith(`.${wanted}`)
      } catch {
        return false
      }
    }) || null
  )
}

/**
 * The URL if we have one; the strongest evidence that a Cloudflare deploy exists
 * for this SHA at all; and, separately, whether OUR project's deploy has already
 * finished and failed. Evidence never widens what reaches `pick()` — it is read
 * off the same Cloudflare-attributable objects the URL sources already walk.
 *
 * `failure` is kept apart from `evidence` because they earn opposite advice: a
 * deploy still running wants a re-run, a deploy that has already failed wants
 * somebody to read the Cloudflare log. Collapsing them is the trap — a failed
 * build DOES post a check run, so counting that as "a deploy exists" would tell
 * the reader to re-run a job that will fail identically.
 *
 * @returns {Promise<{ url: string | null, evidence: string | null, failure: string | null }>}
 */
async function discover() {
  const urls = []
  const evidence = []
  /** Evidence from our OWN project's check run, which outranks the sibling's. */
  let preferred = null
  let failure = null

  // 1. commit statuses
  const statuses = await gh(`/repos/${repo}/commits/${sha}/statuses`)
  if (Array.isArray(statuses)) {
    for (const s of statuses) {
      if (s.target_url) urls.push(...(s.target_url.match(PAGES_RE) || []))
      // Both the context AND the author: a context string is chosen by whoever
      // posts the status, so on its own it is a self-declared identity.
      if (/cloudflare/i.test(s.context || '') && /cloudflare/i.test(s.creator?.login || '')) {
        evidence.push(note(`commit status "${s.context}" (${s.state})`))
      }
    }
  }

  // 2. deployment statuses
  const deployments = await gh(`/repos/${repo}/deployments?sha=${sha}`)
  if (Array.isArray(deployments)) {
    for (const d of deployments) {
      const dStatuses = await gh(`/repos/${repo}/deployments/${d.id}/statuses`)
      if (Array.isArray(dStatuses)) {
        for (const s of dStatuses) {
          if (s.environment_url) urls.push(...(s.environment_url.match(PAGES_RE) || []))
        }
      }
      // `cloudflare` only, matching the other three sources. A bare `pages` would
      // also accept GitHub's own `github-pages` environment, and evidence that
      // isn't Cloudflare's turns "the deploy never happened" into "just re-run
      // it" — softening the one message that needs to stay loud.
      if (/cloudflare/i.test(d.environment || '')) {
        evidence.push(note(`deployment "${d.environment}"`))
      }
    }
  }

  // 3. Check runs. Cloudflare's app renders the preview URL into the check's
  // output summary, which is where the "Cloudflare Pages: <project>" entry in the
  // PR's check list gets its content — so it exists whenever the deploy does.
  //
  // Restricted to check runs owned by Cloudflare's GitHub App, matching the
  // bot-author restriction on source 4 below: posting a check run needs an
  // installed app with write access, a far higher bar than commenting, but the
  // summary is still attacker-influenced markdown if any other app is installed.
  // `pick()` is the real backstop; this narrows what reaches it.
  //
  // A run for the SIBLING project counts as evidence even though its host is
  // (correctly) refused as a URL: it is the same Cloudflare deploy trigger, and
  // it lands a median 41s before the app's own. But it must never be the run we
  // draw a CONCLUSION from — if `-design` succeeded while the app's own build
  // failed, the sibling's "(success)" is the misleading half of the story.
  const checks = await gh(`/repos/${repo}/commits/${sha}/check-runs?per_page=100`)
  if (Array.isArray(checks?.check_runs)) {
    for (const c of checks.check_runs) {
      const slug = c.app?.slug || ''
      if (!/cloudflare/i.test(slug) && !/^cloudflare pages/i.test(c.name || '')) continue
      urls.push(...((c.output?.summary || '').match(PAGES_RE) || []))
      if (c.details_url) urls.push(...(c.details_url.match(PAGES_RE) || []))

      const line = note(`check run "${c.name}" (${c.conclusion || c.status})`)
      if (runProject(c.name) !== projectSlug) {
        evidence.push(line)
        continue
      }
      preferred = line
      // Our project's deploy has finished and did not succeed. `neutral` is
      // Cloudflare's skipped-build conclusion, which is not a failure.
      if (c.status === 'completed' && c.conclusion && !SUCCESS_CONCLUSIONS.has(c.conclusion)) {
        failure = line
      }
    }
  }

  // 4. PR comment from the Cloudflare bot — bot authors only. This repo is
  // public, so any GitHub user can comment on a PR, and during the polling
  // window a comment is often the only candidate on offer.
  //
  // As EVIDENCE the comment is additionally scoped to this SHA: Cloudflare keeps
  // one comment per PR per project and edits it in place, naming the short SHA it
  // is deploying, so an unscoped read would report a previous commit's deploy as
  // this one's. (The URL harvest above is deliberately left unscoped — narrowing
  // a discovery source is #122's territory, not this ticket's.)
  if (prNumber) {
    const comments = await gh(`/repos/${repo}/issues/${prNumber}/comments`)
    if (Array.isArray(comments)) {
      for (const c of comments) {
        if (c.user?.type !== 'Bot') continue
        urls.push(...((c.body || '').match(PAGES_RE) || []))
        if (
          shortSha &&
          /cloudflare/i.test(c.user?.login || '') &&
          (c.body || '').includes(shortSha)
        ) {
          evidence.push(`Cloudflare bot comment naming ${shortSha}`)
        }
      }
    }
  }

  return {
    url: pick([...new Set(urls)]),
    evidence: preferred || evidence[0] || null,
    failure,
  }
}

async function reachable(url) {
  try {
    const res = await fetch(`${url}/`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    return res.status >= 200 && res.status < 400
  } catch {
    return false
  }
}

async function main() {
  if (!token || !repo || !sha) {
    fail('Missing GITHUB_TOKEN / GITHUB_REPOSITORY / PR_HEAD_SHA — cannot discover preview URL.')
  }

  const deadline = startedAt + TIMEOUT_MS
  let lastUrl = null
  let lastEvidence = null

  while (Date.now() < deadline) {
    const { url, evidence } = await discover()
    if (url) lastUrl = url
    if (evidence) lastEvidence = evidence

    if (url && (await reachable(url))) {
      emit(url, STATUS.found)
      return
    }
    // Don't sleep past the deadline: the reported wait should be the budget we
    // actually set, not the budget plus a trailing poll interval.
    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    console.log(
      url
        ? `Preview URL ${url} not reachable yet — waiting…`
        : `No ${project} preview URL yet${lastEvidence ? ` (${lastEvidence})` : ''} — waiting…`,
    )
    await sleep(Math.min(POLL_MS, remaining))
  }

  const status = timeoutStatus({ lastUrl, evidence: lastEvidence })
  emit('', status, explain(status, { lastUrl, evidence: lastEvidence }))
}

// Guarded so the spec can import the pure helpers without running discovery.
// `realpathSync` because `process.argv[1]` keeps a symlink's path while
// `import.meta.url` resolves the target — invoked through a link the guard would
// silently be false, main() would never run, and the step would exit 0 with no
// outputs, which ci.yml reports as "the deploy did not happen".
if (realpathSync(process.argv[1] || '') === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((err) => fail(`Discovery failed: ${err?.message || err}`))
}
