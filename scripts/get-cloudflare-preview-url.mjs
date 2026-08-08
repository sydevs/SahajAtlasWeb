#!/usr/bin/env node

/**
 * Discover the Cloudflare Pages preview URL for a PR and wait until it's
 * reachable, then expose it as the `preview_url` GitHub Actions output — beside
 * a `preview_status` output naming WHICH path we took when that URL is empty.
 *
 * Cloudflare's GitHub integration surfaces the preview URL a few different ways
 * depending on account settings, so we probe several sources for the PR's head
 * SHA and take the BEST-ATTESTED `*.pages.dev` we find (see "WHICH url" below —
 * it used to be the first one, which is issue #138):
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
 * A "Cloudflare is building" state IS observable — the check run exists with
 * `status: in_progress` for the whole build, and this script logs it every poll.
 * Read that sentence twice if you are about to reason from the API: it is the
 * OPPOSITE of what a retrospective query tells you, and #132 was written on the
 * retrospective answer.
 *
 * The trap: Cloudflare sets `started_at` when it COMPLETES the run, so a finished
 * run always reads `started_at == completed_at`. Sampling historical commits —
 * which is what #124's evidence and a 230-run sweep over this repo both did —
 * therefore cannot see the in-progress window at all, and concludes it never
 * existed. Only watching a live build shows it. (The check SUITE really is
 * useless either way: GitHub pre-creates one per installed app on every push, so
 * Cloudflare's sits `queued` with zero runs, indistinguishable from the vercel /
 * railway / sentry suites of apps that never post anything.)
 *
 * So the deadline COULD be extended adaptively on a live signal. It deliberately
 * is not, for a reason that survives the correction: the flat budget above is
 * measured against the full duration distribution and clears the slowest build
 * ever observed by ~1.3×, so an extension would only change behaviour in cases a
 * long-enough deadline already covers, at the price of a second timing rule.
 * Reach for it if the queue ever outgrows the cap — the signal is there.
 *
 * What the live state DOES buy is honest classification: `pending` is now backed
 * by our own project's run saying `in_progress`, not merely by the sibling
 * `sahajatlas-design` run (a median 41s ahead) or the Cloudflare bot's PR
 * comment (ONE per PR, edited in place, naming the SHA it is deploying). Both of
 * those remain evidence; neither is load-bearing on its own any more. It is also
 * why the `failed` test below insists on `status === 'completed'` — an
 * in-progress run has a null conclusion and must never be read as a failure.
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
 * ## WHICH url, not merely a well-formed one (issue #138)
 *
 * `pick()` gates the HOST — that a URL is ours rather than a lookalike somebody
 * else registered. It says nothing about which BUILD that host serves, and
 * Cloudflare publishes two hosts per project: the per-deployment alias
 * (`a73c3b0c.sahajatlas.pages.dev` — one commit, forever) and a stable BRANCH
 * alias (`fix-report-form-delivery.sahajatlas.pages.dev` — whatever deployed to
 * that branch most recently). Both clear the host gate, so taking the first match
 * could smoke-test the PREVIOUS commit and report the result as this one's: the
 * same class of defect as #99's "status is not a result", one level up, and it
 * weakens every gate now leaning on this lane (#99's hard-fail, #106's robots.txt
 * specs, #132's `preview_status`).
 *
 * Observed rather than theorised: on PR #135 the Cloudflare comment for this
 * project still named `9326e3b` and offered that commit's deploy, while the head
 * was `56c6b0d` and had deployed elsewhere. Only the order the sources happen to
 * run in kept the right URL.
 *
 * So a candidate carries its provenance and they are RANKED (`PROVENANCE`):
 *
 *   deployment — the alias named by OUR check run for this SHA. GitHub returned
 *                that run for `/commits/<sha>/`, its `details_url` ends in the
 *                deployment UUID, and the alias is that UUID's first 8 chars — an
 *                unbroken chain from the commit to the host being tested.
 *   attested   — deploy-shaped, from an object GitHub returned for this SHA.
 *   claimed    — deploy-shaped, from a Cloudflare comment naming this SHA. Below
 *                the check run, because the comment is edited in place and may
 *                still be showing the last deploy; above any branch alias,
 *                because it does at least name one immutable build.
 *   alias      — a branch alias, from either kind of source. True when written,
 *                pinned to nothing thereafter.
 *   loose      — everything else. Never selected — and never recorded as the
 *                `lastUrl`, so ignoring one cannot report `unreachable`. It is
 *                still NAMED in the summary (`explain`), because an unexplained
 *                refusal reads as an oversight.
 *
 * What this REFUSES that the old code accepted — enumerated, because "the only
 * thing it refuses is X" is the kind of confident scope claim that has twice
 * shipped a regression in this repo. All four losses are in source 4:
 *
 *   1. a Cloudflare comment naming a different commit — the #135 case, the point
 *      of the ticket;
 *   2. a comment from any NON-Cloudflare bot, which the old code harvested from
 *      unconditionally — a deliberate narrowing, since a discovery fallback has
 *      no business being wider than the integration it backs up;
 *   3. the bare project host, which is PRODUCTION rather than any preview;
 *   4. nothing else. Sources 1–3 all harvest at `commit` scope, which lands on a
 *      selectable tier, so per-SHA discovery loses nothing at all.
 *
 * Checked across PRs #133–#137: our own check run's summary carries the
 * per-deployment URL every time, so the strongest tier is the one that actually
 * fires. The weaker tiers exist only so a change in Cloudflare's formatting
 * degrades discovery rather than reddening every same-repo PR. #132 recorded the
 * per-commit URL as unverified and fenced the fix off as a non-goal; verified now.
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

/**
 * The head short SHA as a whole hex TOKEN. A bare `includes` also matches inside
 * a longer hex run, and Cloudflare's comment is a table that can carry more than
 * one commit reference — so the substring test could call a stale comment
 * "naming the head commit" on a coincidence.
 *
 * Only the LEFT boundary is anchored; the run may then continue. A trailing `\b`
 * looks tighter and is a bug: it rejects every longer spelling of the very same
 * commit (`56c6b0d1`, or the full 40 hex), and git's abbreviation length grows
 * with a repo's object count. Since this now gates the URL harvest and not just
 * the evidence, a stricter test would retire source 4 wholesale the day
 * Cloudflare prints one more digit — turning same-repo PRs `absent`, whose
 * advice is "INVESTIGATE, don't re-run". The false positive it would buy (a
 * DIFFERENT commit whose hex happens to extend this prefix) is both rarer and
 * cheaper than that.
 *
 * Built only from a real hex prefix, so an unexpected `PR_HEAD_SHA` degrades to
 * "no comment names the head" rather than throwing an invalid regex out of the
 * poll loop.
 */
const SHORT_SHA_RE = /^[0-9a-f]{7}$/i.test(shortSha)
  ? new RegExp(`\\b${shortSha}[0-9a-f]*\\b`, 'i')
  : null

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
 * `refused` is named wherever we have one. Without it the `absent` sentence —
 * "no check run, no deployment, no bot comment" — is flatly contradicted by the
 * poll line printed seconds earlier naming the URL we declined, and a reader who
 * scrolls up finds a perfectly good-looking preview sitting there unexplained.
 * That is the precise shape this ticket warns about: a correct refusal that reads
 * as an oversight is one somebody eventually "fixes".
 *
 * @param {string} status
 * @param {{ lastUrl?: string | null, evidence?: string | null, failure?: string | null, refused?: string | null }} ctx
 */
export function explain(status, { lastUrl, evidence, failure, refused } = {}) {
  // Only ever an ADDITION to the sentence: the status was already decided, and a
  // refused URL is not evidence that THIS commit deployed — it is evidence that
  // another one did.
  const ignored = refused
    ? ` The only ${project} URL seen (${refused}) names a different commit, so it was not tested.`
    : ''

  switch (status) {
    case STATUS.failed:
      return `the ${project} deploy for this commit FINISHED AND FAILED (${failure}) — re-running this job cannot help; read the Cloudflare deployment log.`
    case STATUS.unreachable:
      return `${lastUrl} was posted for this commit but never answered a request — the deploy exists, so re-run this job.`
    case STATUS.pending:
      return `a Cloudflare deploy exists for this commit (last seen: ${evidence}) but no ${project} preview URL had been posted — a slow deploy, so re-run this job.${ignored}`
    default:
      return `no Cloudflare signal of any kind for this commit — no check run, no deployment, and no bot comment naming it. The Pages build does not appear to have started.${ignored}`
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
 * How firmly a harvested URL is tied to the head commit — higher wins, and
 * `loose` is refused outright. See "WHICH url" in the header comment: the host
 * gate above answers whose host it is, this answers whose BUILD it serves, and
 * only the second one makes a green Smoke check mean this commit was tested.
 */
export const PROVENANCE = {
  deployment: 4,
  attested: 3,
  claimed: 2,
  alias: 1,
  loose: 0,
}

/**
 * How much a SOURCE knows about the head commit, for keeping the better reading
 * when one URL turns up twice. Ordered, not just labelled: `commit` beats `pr`
 * beats `none`.
 */
const SCOPE_RANK = { none: 0, pr: 1, commit: 2 }

/** Cloudflare's per-deployment alias: the deployment UUID's first 8 hex chars. */
const DEPLOY_LABEL_RE = /^[0-9a-f]{8}$/

/** The leading hostname label, lowercased — `a73c3b0c` in `a73c3b0c.x.pages.dev`. */
function leadingLabel(url) {
  try {
    return new URL(url).hostname.toLowerCase().split('.')[0]
  } catch {
    return ''
  }
}

/**
 * The deployment Cloudflare's check run points at, reduced to the label its
 * preview alias uses. `details_url` is a dashboard link ending in the deployment
 * UUID (`…/pages/view/sahajatlas/a73c3b0c-df19-…`), and the per-deployment alias
 * is that UUID's first 8 characters. So a run GitHub returned FOR THIS SHA names,
 * exactly, which host carries this commit's build — which is what turns selection
 * into a fact rather than a shape heuristic.
 *
 * A branch could of course be *named* eight hex characters and mimic the shape;
 * it cannot forge this.
 * @param {string} [detailsUrl]
 */
export function deploymentAlias(detailsUrl) {
  // The LAST uuid, because the docblock says "ending in": the path is
  // `/pages/view/<project>/<deployment>`, and an earlier segment that also
  // parsed as a uuid would otherwise win and name a host that exists nowhere.
  const all = String(detailsUrl || '').match(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  )

  return all ? all[all.length - 1].slice(0, 8).toLowerCase() : null
}

/**
 * `scope` is where the URL was read from, not what it looks like: `commit` for
 * the three sources GitHub returns FOR THE HEAD SHA, `pr` for a Cloudflare
 * comment naming that SHA, `none` for a comment that names some other commit.
 *
 * A comment is capped BELOW the equivalent check-run tier (`claimed` < `attested`)
 * because it is edited in place per deploy, and we cannot see retrospectively
 * whether Cloudflare blanks its URL cells while a build runs — so a body naming
 * the head SHA might still show the previous deploy's link. The check run must
 * therefore win that race outright rather than tie it and fall back on source
 * order. It still ranks ABOVE a branch alias: it names one immutable build, and a
 * branch alias names none.
 *
 * Deploy-shape is read at BOTH scopes, not only at `commit`. Reading it only for
 * per-SHA sources left a comment's two URLs indistinguishable, so which one won
 * came down to the order Cloudflare happened to print its table in — reproducing,
 * one level down, the exact "source order decided it" defect this ticket exists
 * to remove.
 *
 * `host` is threaded in, rather than read off the module, so the production test
 * below follows CF_PROJECT instead of a stale copy of it.
 *
 * @param {{ url: string, scope: 'commit' | 'pr' | 'none' }} candidate
 * @param {string | null} [deployment]
 * @param {string} [host]
 */
export function provenanceOf({ url, scope }, deployment = null, host = project) {
  const label = leadingLabel(url)
  if (!label) return PROVENANCE.loose
  if (deployment && label === deployment) return PROVENANCE.deployment
  // The BARE project host is production, not a preview. It clears `pick()` and
  // isn't deploy-shaped, so it would otherwise land on the `alias` floor beside
  // a branch alias — but this script only ever runs for a PR head, so
  // production is never the right answer here, whereas a branch alias at least
  // belongs to the branch under review.
  if (label === String(host).toLowerCase().split('.')[0]) return PROVENANCE.loose
  if (scope === 'none') return PROVENANCE.loose

  const deployShaped = DEPLOY_LABEL_RE.test(label)
  if (scope === 'commit') return deployShaped ? PROVENANCE.attested : PROVENANCE.alias

  return deployShaped ? PROVENANCE.claimed : PROVENANCE.alias
}

/**
 * The best-attested URL for CF_PROJECT, or null. Tiers are tried strongest-first
 * and `pick()` — unchanged — decides host acceptance within each, so tightening
 * WHICH url we take cannot loosen WHOSE host we accept. `loose` is not in the
 * list, so it can never be returned.
 * @param {{ url: string, scope: 'commit' | 'pr' | 'none' }[]} candidates
 * @param {{ host?: string, deployment?: string | null }} [options]
 */
export function pickPreview(candidates, { host = project, deployment = null } = {}) {
  const tiers = [PROVENANCE.deployment, PROVENANCE.attested, PROVENANCE.claimed, PROVENANCE.alias]

  for (const tier of tiers) {
    const urls = candidates
      .filter((c) => provenanceOf(c, deployment, host) === tier)
      .map((c) => c.url)
    const url = pick(urls, host)
    if (url) return url
  }

  return null
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
 * `refused` names a URL for our project that provenance rejected — reported only
 * when it left us with nothing, so the log says why the lane kept waiting instead
 * of appearing to ignore a perfectly good URL.
 *
 * @returns {Promise<{ url: string | null, refused: string | null, evidence: string | null, failure: string | null }>}
 */
async function discover() {
  /**
   * URL → the strongest scope it was seen under. A Map so the same URL appearing
   * in two sources keeps the better provenance (and its first position) rather
   * than whichever source happened to run last.
   * @type {Map<string, 'commit' | 'pr' | 'none'>}
   */
  const candidates = new Map()

  /**
   * @param {'commit' | 'pr' | 'none'} scope
   * @param {string | null | undefined} text
   */
  const harvest = (scope, text) => {
    for (const url of String(text || '').match(PAGES_RE) || []) {
      const seen = candidates.get(url)
      if (seen === undefined || SCOPE_RANK[scope] > SCOPE_RANK[seen]) candidates.set(url, scope)
    }
  }

  const evidence = []
  /** Evidence from our OWN project's check run, which outranks the sibling's. */
  let preferred = null
  let failure = null
  /**
   * The deployment our project's check run for this SHA names — see `deploymentAlias`.
   * @type {string | null}
   */
  let deployment = null

  // 1. commit statuses
  const statuses = await gh(`/repos/${repo}/commits/${sha}/statuses`)
  if (Array.isArray(statuses)) {
    for (const s of statuses) {
      harvest('commit', s.target_url)
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
        for (const s of dStatuses) harvest('commit', s.environment_url)
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
      harvest('commit', c.output?.summary)
      harvest('commit', c.details_url)

      const line = note(`check run "${c.name}" (${c.conclusion || c.status})`)
      if (runProject(c.name) !== projectSlug) {
        evidence.push(line)
        continue
      }

      // CANDIDATES may come from a run admitted on its NAME; CONCLUSIONS may
      // not. A name is self-declared, so an installed App with `checks:write`
      // could call itself "Cloudflare Pages: sahajatlas" — and the three things
      // below are the ones that would then be its word rather than Cloudflare's:
      // which deployment is this commit's, what the summary quotes, and whether
      // the build FAILED. That last is the sharpest: `failed` tells the reader
      // "re-running cannot help", so a forged one is a red Smoke check nobody
      // can clear. URLs are the safe half — `pick()` bounds them to hosts only
      // Cloudflare serves — which is why the name-only path still feeds the
      // harvest above and keeps its resilience if the app slug ever changes.
      //
      // Same rule as source 1's "both the context AND the author".
      if (!/cloudflare/i.test(slug)) continue

      preferred = line
      // Which deployment this commit produced, straight from the run GitHub
      // returned for it. Last-write-wins: `/check-runs` defaults to
      // `filter=latest`, which returns one run per check NAME — unique per APP,
      // not globally, which is the other reason the gate above matters. An
      // in-progress run may carry no deployment yet; that resolves to null and
      // the weaker tiers cover the gap until it does.
      deployment = deploymentAlias(c.details_url)
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
  // Both the URL harvest and the evidence are scoped to this SHA (issue #138):
  // Cloudflare keeps one comment per PR per project and edits it in place, naming
  // the short SHA it is deploying, so an unscoped read reports a PREVIOUS
  // commit's deploy as this one's. That is not hypothetical — on PR #135 this
  // comment still named `9326e3b` and linked that commit's deploy while the head
  // was `56c6b0d`. A comment naming some other commit is harvested as `none`,
  // which no tier selects.
  //
  // The URL harvest also now requires the Cloudflare login, matching the gate the
  // evidence already used. Any installed app's bot could otherwise contribute a
  // candidate; `pick()` still bounds the damage to hosts Cloudflare controls, but
  // there is no reason for a discovery FALLBACK to be wider than the integration
  // it is a fallback for.
  if (prNumber) {
    const comments = await gh(`/repos/${repo}/issues/${prNumber}/comments`)
    if (Array.isArray(comments)) {
      for (const c of comments) {
        if (c.user?.type !== 'Bot') continue
        const fromCloudflare = /cloudflare/i.test(c.user?.login || '')
        const namesHead = Boolean(SHORT_SHA_RE?.test(c.body || ''))

        harvest(fromCloudflare && namesHead ? 'pr' : 'none', c.body)
        if (fromCloudflare && namesHead) {
          evidence.push(`Cloudflare bot comment naming ${shortSha}`)
        }
      }
    }
  }

  const list = [...candidates].map(([url, scope]) => ({ url, scope }))
  const url = pickPreview(list, { deployment })

  return {
    url,
    // Only worth naming when it cost us the poll — otherwise the better URL is
    // already the story.
    refused: url ? null : pick([...candidates.keys()]),
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

/**
 * What this poll is waiting on. A URL we deliberately did NOT take is worth a
 * line of its own: the alternative reads as the script overlooking a URL that is
 * sitting right there in the PR, which is how a correct refusal gets "fixed".
 * @param {{ url: string | null, refused: string | null, evidence: string | null }} seen
 */
export function waitingLine({ url, refused, evidence }, sha = shortSha, host = project) {
  if (url) return `Preview URL ${url} not reachable yet — waiting…`

  // Both, never one or the other: a poll can have a live sibling run AND a stale
  // comment, and dropping the evidence half loses the "a deploy exists" signal
  // that separates a slow build from an absent one.
  const seen = [
    refused ? `ignoring ${refused} — not attributable to ${sha}` : '',
    evidence || '',
  ].filter(Boolean)

  return `No ${host} preview URL yet${seen.length ? ` (${seen.join('; ')})` : ''} — waiting…`
}

async function main() {
  if (!token || !repo || !sha) {
    fail('Missing GITHUB_TOKEN / GITHUB_REPOSITORY / PR_HEAD_SHA — cannot discover preview URL.')
  }

  const deadline = startedAt + TIMEOUT_MS
  let lastUrl = null
  let lastEvidence = null
  let lastFailure = null
  let lastRefused = null

  while (Date.now() < deadline) {
    // `failure` is read here, not just computed in discover(): without it
    // `timeoutStatus` can never return `failed`, and the status that exists
    // precisely so a broken build isn't reported as a slow one was unreachable
    // in production while its unit spec passed (issue #132's code review added
    // the status; nothing wired it through).
    const { url, refused, evidence, failure } = await discover()
    if (url) lastUrl = url
    if (evidence) lastEvidence = evidence
    if (failure) lastFailure = failure
    if (refused) lastRefused = refused

    if (url && (await reachable(url))) {
      emit(url, STATUS.found)
      return
    }
    // Don't sleep past the deadline: the reported wait should be the budget we
    // actually set, not the budget plus a trailing poll interval.
    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    console.log(waitingLine({ url, refused, evidence: lastEvidence }))
    await sleep(Math.min(POLL_MS, remaining))
  }

  // `refused` rides along into the SUMMARY, not just the poll log — that is the
  // one line a reader actually sees, and without it `absent` denies the very URL
  // the log named. It deliberately does not reach `timeoutStatus`: a URL naming a
  // different commit is evidence that some OTHER commit deployed, so it must not
  // soften `absent` into "a deploy exists, re-run".
  const seen = {
    lastUrl,
    evidence: lastEvidence,
    failure: lastFailure,
    refused: lastUrl ? null : lastRefused,
  }
  const status = timeoutStatus(seen)
  emit('', status, explain(status, seen))
}

// Guarded so the spec can import the pure helpers without running discovery.
// `realpathSync` because `process.argv[1]` keeps a symlink's path while
// `import.meta.url` resolves the target — invoked through a link the guard would
// silently be false, main() would never run, and the step would exit 0 with no
// outputs, which ci.yml reports as "the deploy did not happen".
if (realpathSync(process.argv[1] || '') === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((err) => fail(`Discovery failed: ${err?.message || err}`))
}
