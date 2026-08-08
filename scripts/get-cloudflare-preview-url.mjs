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
 *   CF_PROJECT          (optional) — prefer URLs containing this project slug
 *   PREVIEW_TIMEOUT_MS  (optional) — override the discovery deadline
 */

import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { report } from './_ci-output.mjs'

const token = process.env.GITHUB_TOKEN
const repo = process.env.GITHUB_REPOSITORY
const sha = process.env.PR_HEAD_SHA
const prNumber = process.env.PR_NUMBER
const project = process.env.CF_PROJECT || 'sahajatlas.pages.dev' // the app's *.pages.dev host (not the -design playground)

// 10 minutes — justified against 86 measured builds in the header comment, not
// against the feel of it. Overridable so a queue deeper than any yet observed is
// a workflow edit rather than a code change.
const DEFAULT_TIMEOUT_MS = 10 * 60_000
const TIMEOUT_MS = Number(process.env.PREVIEW_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS
const POLL_MS = 15_000
const PAGES_RE = /https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pages\.dev/gi

/** The `preview_status` output's vocabulary — see the header comment. */
export const STATUS = {
  found: 'found',
  unreachable: 'unreachable',
  pending: 'pending',
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
 * @param {{ lastUrl: string | null, evidence: string | null }} seen
 */
export function timeoutStatus({ lastUrl, evidence }) {
  if (lastUrl) return STATUS.unreachable

  return evidence ? STATUS.pending : STATUS.absent
}

/**
 * One sentence a reader can act on, naming the last thing we saw. Only the three
 * timeout outcomes reach here — `error` carries its own message straight from
 * `fail()`. The elapsed wait is `emit`'s to print (it prefixes every line with
 * it), so repeating it here would say the same number twice in one sentence.
 * @param {string} status
 * @param {{ lastUrl?: string | null, evidence?: string | null }} ctx
 */
export function explain(status, { lastUrl, evidence } = {}) {
  switch (status) {
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

  report([
    '### Preview discovery',
    '',
    url
      ? `✅ \`${status}\` after ${elapsed} — smoke specs will run against ${url}`
      : `⚠️ \`${status}\` after ${elapsed} — ${detail}`,
  ])

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `preview_url=${url}\npreview_status=${status}\n`)
  }
}

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!res.ok) return null
  return res.json()
}

// Only accept a URL for the configured project. Two Pages projects deploy per PR
// (the app + the `-design` Ladle playground), so a plain "first *.pages.dev"
// fallback would smoke-test the wrong deploy — return null (keep polling, then
// skip) rather than guess.
//
// Matched on the HOSTNAME, at a label boundary. A substring test accepts
// `https://evil-sahajatlas.pages.dev`, and `pages.dev` subdomains are
// first-come-first-served — so with source 3 below reading PR comments, anyone
// who can comment could aim the smoke lane at a host they control and collect a
// green check that verified nothing. That mattered less when a missing preview
// merely skipped; ci.yml now hard-fails on one, which makes a hijacked URL the
// more attractive target of the two.
export function pick(urls, host = project) {
  return (
    urls.find((u) => {
      try {
        const { hostname } = new URL(u)

        return hostname === host || hostname.endsWith(`.${host}`)
      } catch {
        return false
      }
    }) || null
  )
}

/**
 * The URL if we have one, plus the strongest evidence that a Cloudflare deploy
 * exists for this SHA at all. Evidence never widens what reaches `pick()` — it
 * is read off the same Cloudflare-attributable objects the URL sources already
 * walk, in source order, so the check run (the dependable one here) wins over
 * the comment.
 */
async function discover() {
  const urls = []
  const evidence = []

  // 1. commit statuses
  const statuses = await gh(`/repos/${repo}/commits/${sha}/statuses`)
  if (Array.isArray(statuses)) {
    for (const s of statuses) {
      if (s.target_url) urls.push(...(s.target_url.match(PAGES_RE) || []))
      if (/cloudflare/i.test(s.context || '')) {
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
      if (/cloudflare|pages/i.test(d.environment || '')) {
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
  // it lands a median 41s before the app's own.
  const checks = await gh(`/repos/${repo}/commits/${sha}/check-runs?per_page=100`)
  if (Array.isArray(checks?.check_runs)) {
    for (const c of checks.check_runs) {
      const slug = c.app?.slug || ''
      if (!/cloudflare/i.test(slug) && !/^cloudflare pages/i.test(c.name || '')) continue
      urls.push(...((c.output?.summary || '').match(PAGES_RE) || []))
      if (c.details_url) urls.push(...(c.details_url.match(PAGES_RE) || []))
      evidence.push(note(`check run "${c.name}" (${c.conclusion || c.status})`))
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
        const shortSha = (sha || '').slice(0, 7)
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

  return { url: pick([...new Set(urls)]), evidence: evidence[0] || null }
}

async function reachable(url) {
  try {
    const res = await fetch(`${url}/`, { redirect: 'follow' })
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
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => fail(`Discovery failed: ${err?.message || err}`))
}
