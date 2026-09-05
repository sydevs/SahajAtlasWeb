#!/usr/bin/env node

/**
 * Discovers the Cloudflare Pages preview URL for a PR, and waits until it
 * answers. It exposes that URL as the `preview_url` GitHub Actions output.
 * A second output, `preview_status`, names WHICH path this script took
 * when the URL comes back empty.
 *
 * Cloudflare's GitHub integration surfaces the preview URL in a few
 * different ways, depending on account settings. So this script probes
 * several sources for the PR's head SHA. It takes the BEST-ATTESTED
 * `*.pages.dev` URL it finds (see "WHICH url" below — an earlier version
 * took the first match instead, which was issue #138):
 *   1. commit statuses        → status.target_url
 *   2. deployment statuses    → status.environment_url
 *   3. check runs             → the Cloudflare app's output summary
 *   4. the Cloudflare bot's PR comment body
 *
 * On THIS repo, only source 3 is dependable (PR #120). Cloudflare posts
 * neither commit statuses nor GitHub deployments here — both queries come
 * back empty. So discovery used to rest entirely on source 4, and the
 * bot's comment is best-effort. That made the smoke gate flaky by
 * construction. Issue #99 made a missing preview HARD-FAIL a same-repo
 * PR. The flake then showed up as a red check on a good commit. The check
 * run is the same object the "Cloudflare Pages: …" entry in the PR's check
 * list comes from. It exists exactly when the deploy does.
 *
 * ## How long to wait (issue #132)
 *
 * The wait budget used to be 6 minutes. That was not a margin over the
 * observed build time — it WAS the observed build time. This script
 * measured 86 successful `Cloudflare Pages: sahajatlas` check runs: every
 * commit on main, plus every PR head from #58 to #128. It measured from
 * the push landing to the run being posted:
 *
 *   p50 99s · p75 138s · p90 232s · p95 373s · max 453s
 *
 * So the old 360s budget sat BELOW the 95th percentile. The slow tail
 * comes from queueing, not build size. The slow samples cluster in
 * windows where several PRs deploy at once (280 / 301 / 373 / 393 / 397 /
 * 453s form one such window). That is exactly how people work in this
 * repo. #124 came in at 397s, and it went red on a healthy commit.
 *
 * So the deadline is now 10 minutes. That is about 1.3 times the slowest
 * sample observed, with room for a deeper queue than any measured here. A
 * longer wait only costs idle runner minutes. It still fits inside the
 * Smoke job's `timeout-minutes: 15`, alongside the install step and the
 * specs — raise that cap too, before raising this one further. Note that
 * the clock starts when this STEP starts, 30 to 60 seconds after the push
 * (33s on #124). So the real budget from the push is a little more than
 * the constant below. Override it with `PREVIEW_TIMEOUT_MS`, rather than
 * editing the constant.
 *
 * ## Why the wait is flat, not adaptive
 *
 * A "Cloudflare is building" state IS observable. The check run carries
 * `status: in_progress` for the whole build, and this script logs that
 * state on every poll. Read that sentence twice before reasoning from the
 * API. It is the OPPOSITE of what a retrospective query tells you. #132
 * was written on that wrong, retrospective answer.
 *
 * Here is the trap: Cloudflare sets `started_at` only when a run
 * COMPLETES. So a finished run always shows `started_at == completed_at`.
 * Sampling historical commits cannot see the in-progress window at all —
 * that is what #124's evidence did, and what a separate 230-run sweep of
 * this repo also did. Both concluded the in-progress window never
 * existed. Only watching a live build shows it. (The check SUITE object
 * is useless either way. GitHub pre-creates one suite per installed app
 * on every push. Cloudflare's suite therefore sits `queued` with zero
 * runs, indistinguishable from the vercel, railway, or sentry suites of
 * apps that post nothing at all.)
 *
 * So the deadline COULD extend adaptively, based on a live signal. It
 * deliberately does not, for a reason that survives the correction above.
 * The flat budget is measured against the full duration distribution, and
 * it clears the slowest build ever observed by about 1.3 times. An
 * adaptive extension would only change behavior in cases a long-enough
 * flat deadline already covers. It would add a second timing rule at that
 * price. Reach for an adaptive extension only if the queue ever outgrows
 * this cap — the live signal is already there to use.
 *
 * What the live state DOES buy is honest classification. `pending` now
 * rests on our own project's run saying `in_progress`. It no longer rests
 * only on the sibling `sahajatlas-design` run (a median 41 seconds
 * ahead), or on the Cloudflare bot's PR comment (one per PR, edited in
 * place, naming the SHA it deploys). Both of those remain evidence.
 * Neither is load-bearing alone anymore. This is also why the `failed`
 * check below insists on `status === 'completed'`. An in-progress run has
 * a null conclusion, and it must never read as a failure.
 *
 * ## "Empty" is not one outcome (issue #132)
 *
 * If nothing usable turns up, this script still emits an EMPTY
 * preview_url and exits 0. This script only ever reports discovery
 * problems — it never fails on them directly. But the workflow cannot act
 * on "empty" alone. Only one path to "empty" is a real failure. So
 * `preview_status` names which path it was:
 *
 *   found       — a reachable URL for CF_PROJECT. preview_url is set.
 *   unreachable — a URL for CF_PROJECT was posted, but it never answered
 *                 a request.
 *   pending     — a Cloudflare deploy exists for this SHA, but no usable
 *                 URL yet.
 *   absent      — no Cloudflare signal at all for this SHA. The deploy
 *                 did not happen. This is the genuine failure.
 *   error       — a missing environment variable, or an unhandled throw.
 *
 * `pending` and `unreachable` both stay RED on a same-repo PR. A green
 * Smoke check that ran nothing is exactly the hole #99 closed. But
 * ci.yml tells the reader to re-run the job, not to investigate. It also
 * states how long this script waited, and what it last saw. Whether an
 * empty result is tolerable stays the WORKFLOW's call. Exiting non-zero
 * here would turn a fork's expected skip into a red check.
 *
 * ## WHICH url, not merely a well-formed one (issue #138)
 *
 * `pick()` checks the HOST. It confirms a URL is ours, not a lookalike
 * someone else registered. It says nothing about which BUILD that host
 * serves. Cloudflare publishes two hosts per project. The per-deployment
 * alias (`a73c3b0c.sahajatlas.pages.dev`) names one commit, forever. The
 * stable BRANCH alias (`fix-report-form-delivery.sahajatlas.pages.dev`)
 * names whatever deployed to that branch most recently. Both clear the
 * host gate. So taking the first match could smoke-test the PREVIOUS
 * commit, and report that result as this commit's. That is the same class
 * of defect as #99's "status is not a result", one level up. It weakens
 * every gate that now leans on this lane: #99's hard-fail, #106's
 * robots.txt specs, and #132's `preview_status`.
 *
 * This defect is observed, not theorized. On PR #135, the Cloudflare
 * comment for this project still named `9326e3b`, and it offered that
 * commit's deploy. The actual head was `56c6b0d`, and it had deployed
 * elsewhere. Only the order the sources happened to run in kept the right
 * URL that time.
 *
 * So a candidate now carries its provenance, and candidates get RANKED
 * (`PROVENANCE`):
 *
 *   deployment — the alias named by OUR OWN check run for this SHA.
 *                GitHub returned that run for `/commits/<sha>/`. Its
 *                `details_url` ends in the deployment UUID, and the alias
 *                is that UUID's first 8 characters. This forms an
 *                unbroken chain, from the commit to the host under test.
 *   attested   — deploy-shaped, from an object GitHub returned for this
 *                SHA.
 *   claimed    — deploy-shaped, from a Cloudflare comment naming this
 *                SHA. This ranks below the check run, because Cloudflare
 *                edits the comment in place, and it may still show the
 *                last deploy. It ranks above any branch alias, because it
 *                at least names one immutable build.
 *   alias      — a branch alias, from either kind of source. True when
 *                written, but pinned to nothing after that.
 *   loose      — everything else. This script never selects a `loose`
 *                candidate, and it never records one as `lastUrl` either.
 *                So ignoring a loose candidate cannot report
 *                `unreachable`. The summary (`explain`) still NAMES it: an
 *                unexplained refusal reads as an oversight.
 *
 * This section lists in full what this script now REFUSES, that the old
 * code accepted. A claim like "the only thing it refuses is X" is the
 * kind of confident scope claim that has shipped a regression in this
 * repo twice already. All four losses sit in source 4:
 *
 *   1. A Cloudflare comment naming a different commit. This is the #135
 *      case, and the point of this fix.
 *   2. A comment from any NON-Cloudflare bot. The old code harvested
 *      these unconditionally. This fix narrows that on purpose — a
 *      discovery fallback should never be wider than the integration it
 *      backs up.
 *   3. The bare project host, which is PRODUCTION, not any preview.
 *   4. Nothing else. Sources 1 through 3 all harvest at `commit` scope,
 *      which lands on a selectable tier. So per-SHA discovery loses
 *      nothing at all.
 *
 * This script's behavior was checked across PRs #133 through #137. Our
 * own check run's summary carries the per-deployment URL every time, so
 * the strongest tier is the one that actually fires in practice. The
 * weaker tiers exist only so a change in Cloudflare's formatting degrades
 * discovery gracefully, instead of reddening every same-repo PR. #132
 * recorded the per-commit URL as unverified, and it fenced this fix off
 * as a non-goal. It is verified now.
 *
 * Env:
 *   GITHUB_TOKEN        (required) — read access to statuses, deployments,
 *                       and issues.
 *   GITHUB_REPOSITORY   (set automatically in Actions) — "owner/repo".
 *   PR_HEAD_SHA         (required) — the PR head commit.
 *   PR_NUMBER           (optional) — enables the PR-comment fallback.
 *   CF_PROJECT          (optional) — the app's `*.pages.dev` HOST. `pick()`
 *                       accepts a URL only when its hostname IS this host,
 *                       or a subdomain of it. It never runs a substring
 *                       or slug test.
 *   PREVIEW_TIMEOUT_MS  (optional) — the discovery deadline, in
 *                       MILLISECONDS. This script ignores it unless it is
 *                       positive. It caps the value at MAX_TIMEOUT_MS.
 */

import { appendFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { report } from './_ci-output.mjs'

const token = process.env.GITHUB_TOKEN
const repo = process.env.GITHUB_REPOSITORY
const sha = process.env.PR_HEAD_SHA
const prNumber = process.env.PR_NUMBER
const project = process.env.CF_PROJECT || 'sahajatlas.pages.dev' // the app's *.pages.dev host, not the -design playground

const shortSha = (sha || '').slice(0, 7)

/**
 * A regex that matches the head short SHA as a whole hex TOKEN.
 *
 * A bare `includes` call would also match inside a longer hex run.
 * Cloudflare's comment is a table that can carry more than one commit
 * reference. So a plain substring test could call a stale comment "naming
 * the head commit" by coincidence.
 *
 * Only the LEFT boundary is anchored here. The matched run may then
 * continue further to the right. A trailing `\b` boundary looks tighter,
 * but it is a bug. It would reject every longer spelling of the same
 * commit, such as `56c6b0d1` or the full 40-character hex. Git's
 * abbreviation length also grows as a repo's object count grows. This
 * regex now gates the URL harvest itself, not only the evidence. A
 * stricter test would retire source 4 entirely, the day Cloudflare prints
 * one more digit. That would turn same-repo PRs `absent`, whose advice is
 * "INVESTIGATE, don't re-run". The false positive a looser test allows —
 * a DIFFERENT commit whose hex happens to extend this prefix — is both
 * rarer and cheaper than that outcome.
 *
 * This regex builds only from a real hex prefix. An unexpected
 * `PR_HEAD_SHA` value then degrades to "no comment names the head". It
 * does not throw an invalid regex out of the poll loop.
 */
const SHORT_SHA_RE = /^[0-9a-f]{7}$/i.test(shortSha)
  ? new RegExp(`\\b${shortSha}[0-9a-f]*\\b`, 'i')
  : null

// The project's own slug. This lets the script tell our check run
// ("Cloudflare Pages: sahajatlas") apart from the sibling playground's
// ("…: sahajatlas-design").
const projectSlug = project.split('.')[0].toLowerCase()

/** @param {string} [name] */
function runProject(name) {
  const match = /:\s*([a-z0-9-]+)\s*$/i.exec(name || '')

  return match ? match[1].toLowerCase() : null
}

// Cloudflare skips a build when it has nothing to do, and reports that
// outcome as `neutral`. A skipped build is not a failed deploy.
const SUCCESS_CONCLUSIONS = new Set(['success', 'neutral', 'skipped'])

// 10 minutes. The header comment above justifies this value against 86
// measured builds, not against how it feels. This constant is
// overridable, so a queue deeper than anything measured here needs only a
// workflow edit, not a code change.
const DEFAULT_TIMEOUT_MS = 10 * 60_000

// This must stay under the Smoke job's `timeout-minutes` value, minus the
// install time and the specs.
const MAX_TIMEOUT_MS = 12 * 60_000

/**
 * Converts an override into milliseconds. A bad override gets IGNORED,
 * not honored. If this function read `PREVIEW_TIMEOUT_MS=600` as seconds,
 * it would set a 0.6-second deadline — one poll — and then confidently
 * report "the deploy did not happen — investigate" about a build that
 * never had time to start. Wrong advice, stated loudly, is exactly the
 * failure mode this whole fix is about.
 * @param {string | undefined} raw
 */
export function timeoutFrom(raw, max = MAX_TIMEOUT_MS) {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS

  // This value is capped as well as floored. An override larger than the
  // Smoke job's own `timeout-minutes` value would get the whole job
  // CANCELLED. That skips the reporting step, and it leaves a red check
  // with no message at all.
  return Math.min(parsed, max)
}

const TIMEOUT_MS = timeoutFrom(process.env.PREVIEW_TIMEOUT_MS)
const POLL_MS = 15_000

// This bounds every request, so a hung socket cannot outlive the whole
// time budget. undici's default timeout is 300 seconds. The Smoke job's
// `timeout-minutes` cap would then CANCEL the whole job on top of that,
// skipping the reporting step and leaving a red check with no message.
// That outcome is strictly worse than the timeout this fix exists to
// prevent.
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
 * Quotes API-supplied text, such as a check run's name, into the step
 * summary. Source 3 accepts a run whose NAME starts with "cloudflare
 * pages" from any installed app, not only Cloudflare's own app. So this
 * function treats that text as hostile. It flattens the text to one line,
 * and it caps the length. A newline is what would turn a quoted name into
 * a forged summary line — `report()` only defangs a leading `::`.
 * @param {string} text
 */
export function note(text) {
  return String(text).replace(/\s+/g, ' ').trim().slice(0, 120)
}

/**
 * Decides what the deadline expiring means, given what this script saw
 * before it expired. Positive evidence separates a slow deploy from an
 * absent one. That distinction is the whole point of the second output —
 * only the absent case is a real failure.
 * @param {{ lastUrl?: string | null, evidence?: string | null, failure?: string | null }} seen
 */
export function timeoutStatus({ lastUrl, evidence, failure }) {
  // A finished-and-failed deploy outranks every other outcome. It is the
  // one case where both waiting longer and re-running are the wrong
  // answer.
  if (failure) return STATUS.failed
  if (lastUrl) return STATUS.unreachable

  return evidence ? STATUS.pending : STATUS.absent
}

/**
 * Builds one sentence a reader can act on, naming the last thing this
 * script saw. Only the three timeout outcomes reach this function —
 * `error` carries its own message straight from `fail()`. `emit` already
 * prints the elapsed wait itself, prefixing every line with it. Repeating
 * that number here would state it twice in one sentence.
 *
 * This function names `refused` wherever there is one. Without it, the
 * `absent` sentence — "no check run, no deployment, no bot comment" —
 * would flatly contradict the poll line printed seconds earlier, which
 * named the URL this script declined. A reader who scrolls up would then
 * find a perfectly good-looking preview sitting there unexplained. That
 * is the exact shape this fix warns about: a correct refusal that reads
 * as an oversight is one somebody eventually "fixes".
 *
 * @param {string} status
 * @param {{ lastUrl?: string | null, evidence?: string | null, failure?: string | null, refused?: string | null }} ctx
 */
export function explain(status, { lastUrl, evidence, failure, refused } = {}) {
  // This text is only ever an ADDITION to the sentence. The status was
  // already decided. A refused URL is not evidence that THIS commit
  // deployed. It is evidence that another commit did.
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

  // The OUTPUTS are the contract. The summary is only presentation. This
  // function writes the outputs first. If `$GITHUB_STEP_SUMMARY` is
  // unwritable, `report()` throws. With the order reversed, that throw
  // would take the outputs down with it. `ci.yml` would then read an
  // empty status, and blame Cloudflare for a filesystem problem.
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
    // A timed-out or failed probe looks identical to "nothing there yet".
    // The next poll will ask again. So this catch must not abort the
    // whole run.
    return null
  }
}

// This function accepts a URL only for the configured project. Two Pages
// projects deploy per PR: the app, and the `-design` Ladle playground. A
// plain "first *.pages.dev" fallback would therefore smoke-test the wrong
// deploy. This function returns `null` instead of guessing — the caller
// keeps polling, then skips.
//
// The match happens on the HOSTNAME, at a label boundary. A substring
// test would accept `https://evil-sahajatlas.pages.dev`, and `pages.dev`
// subdomains are first-come-first-served. So a URL scraped from source
// 4's PR comments could aim the smoke lane at a host somebody else
// controls, and collect a green check that verified nothing. Source 4's
// bot-author gate limits that risk. `user.type` is GitHub's own
// classification, not a self-declared one, so the risk is not "anyone who
// can comment" — it takes a bot belonging to some installed GitHub App.
// `pick()` is what makes that risk not matter. The risk mattered less
// when a missing preview merely skipped the check. `ci.yml` now
// hard-fails on a missing preview, which makes a hijacked URL a more
// attractive target.
export function pick(urls, host = project) {
  // `URL.hostname` is always ASCII-lowercased. `host` comes from
  // `CF_PROJECT`, and that variable is not lowercased. Without this line,
  // an uppercase letter in that variable would match nothing. Discovery
  // would come back empty, and every same-repo PR would turn red because
  // of a typo.
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
 * How firmly a harvested URL ties to the head commit. A higher value
 * wins, and this script refuses `loose` outright. See "WHICH url" in the
 * header comment. The host gate above answers whose host a URL is. This
 * value answers whose BUILD it serves. Only the second answer makes a
 * green Smoke check mean this commit was actually tested.
 */
export const PROVENANCE = {
  deployment: 4,
  attested: 3,
  claimed: 2,
  alias: 1,
  loose: 0,
}

/**
 * How much a SOURCE knows about the head commit. This script uses it to
 * keep the better reading when one URL turns up twice. The values are
 * ordered, not only labeled: `commit` beats `pr`, and `pr` beats `none`.
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
 * The deployment Cloudflare's check run points at, reduced to the label
 * its preview alias uses. `details_url` is a dashboard link that ends in
 * the deployment UUID (`…/pages/view/sahajatlas/a73c3b0c-df19-…`). The
 * per-deployment alias is that UUID's first 8 characters. So a run GitHub
 * returned FOR THIS SHA names, exactly, which host carries this commit's
 * build. That fact is what turns selection into a proof, rather than a
 * shape heuristic.
 *
 * A branch name could, of course, be eight hex characters, and mimic this
 * shape. It cannot forge this check.
 * @param {string} [detailsUrl]
 */
export function deploymentAlias(detailsUrl) {
  // This takes the LAST uuid in the string, because the docblock above
  // says "ends in". The path shape is
  // `/pages/view/<project>/<deployment>`. An earlier segment that also
  // parses as a uuid would otherwise win, and name a host that exists
  // nowhere.
  const all = String(detailsUrl || '').match(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  )

  return all ? all[all.length - 1].slice(0, 8).toLowerCase() : null
}

/**
 * `scope` names WHERE this script read the URL from, not what the URL
 * looks like. `commit` covers the three sources GitHub returns FOR THE
 * HEAD SHA. `pr` covers a Cloudflare comment naming that SHA. `none`
 * covers a comment that names some other commit.
 *
 * A comment is capped BELOW the equivalent check-run tier: `claimed`
 * ranks under `attested`. Cloudflare edits the comment in place on every
 * deploy, and there is no way to see, in retrospect, whether Cloudflare
 * blanks its URL cells while a build runs. So a comment naming the head
 * SHA might still show the previous deploy's link. The check run must
 * therefore win that race outright, rather than tie it and fall back on
 * source order. A comment still ranks ABOVE a branch alias, because it
 * names one immutable build, and a branch alias names none.
 *
 * This function reads deploy-shape at BOTH scopes, not only at `commit`.
 * Reading it only for per-SHA sources left a comment's two URLs
 * indistinguishable. Which one won then came down to the order Cloudflare
 * happened to print its table in. That reproduces, one level down, the
 * exact "source order decided it" defect this fix exists to remove.
 *
 * This function takes `host` as a parameter, rather than reading it off
 * the module. This way, the production check below follows `CF_PROJECT`
 * directly, instead of a stale copy of it.
 *
 * @param {{ url: string, scope: 'commit' | 'pr' | 'none' }} candidate
 * @param {string | null} [deployment]
 * @param {string} [host]
 */
export function provenanceOf({ url, scope }, deployment = null, host = project) {
  const label = leadingLabel(url)
  if (!label) return PROVENANCE.loose
  if (deployment && label === deployment) return PROVENANCE.deployment
  // The BARE project host is production, not a preview. It clears
  // `pick()`, and it is not deploy-shaped, so it would otherwise land on
  // the `alias` floor beside a branch alias. But this script only ever
  // runs for a PR head. Production is never the right answer here, while
  // a branch alias at least belongs to the branch under review.
  if (label === String(host).toLowerCase().split('.')[0]) return PROVENANCE.loose
  if (scope === 'none') return PROVENANCE.loose

  const deployShaped = DEPLOY_LABEL_RE.test(label)
  if (scope === 'commit') return deployShaped ? PROVENANCE.attested : PROVENANCE.alias

  return deployShaped ? PROVENANCE.claimed : PROVENANCE.alias
}

/**
 * The best-attested URL for `CF_PROJECT`, or `null`. This function tries
 * tiers strongest-first. `pick()` — unchanged — still decides host
 * acceptance within each tier. So tightening WHICH url this picks can
 * never loosen WHOSE host it accepts. `loose` is not in the tier list, so
 * this function can never return a `loose` candidate.
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
 * Returns the URL, if this script has found one. It also returns the
 * strongest evidence that a Cloudflare deploy exists for this SHA at
 * all. Separately, it returns whether OUR project's deploy has already
 * finished and failed. Evidence never widens what reaches `pick()` — this
 * function reads it off the same Cloudflare-attributable objects the URL
 * sources already walk.
 *
 * This function keeps `failure` apart from `evidence`, because the two
 * need opposite advice. A deploy still running wants a re-run. A deploy
 * that already failed wants somebody to read the Cloudflare log.
 * Collapsing the two is the trap: a failed build DOES post a check run,
 * so counting that as "a deploy exists" would tell the reader to re-run a
 * job that will fail the same way again.
 *
 * `refused` names a URL for our project that provenance rejected. This
 * function reports it only when that rejection left this script with
 * nothing. That way, the log states why the lane kept waiting, instead of
 * appearing to ignore a perfectly good URL.
 *
 * @returns {Promise<{ url: string | null, refused: string | null, evidence: string | null, failure: string | null }>}
 */
async function discover() {
  /**
   * Maps each URL to the strongest scope it was seen under. A `Map` means
   * the same URL, seen in two sources, keeps the better provenance and
   * its first position, rather than whichever source happened to run
   * last.
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
      // This checks both the context AND the author. Whoever posts the
      // status chooses the context string, so the context alone is a
      // self-declared identity.
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
      // This matches `cloudflare` only, the same as the other three
      // sources. A bare `pages` match would also accept GitHub's own
      // `github-pages` environment. Evidence that is not Cloudflare's
      // would then turn "the deploy never happened" into "just re-run
      // it" — softening the one message that needs to stay loud.
      if (/cloudflare/i.test(d.environment || '')) {
        evidence.push(note(`deployment "${d.environment}"`))
      }
    }
  }

  // 3. Check runs. Cloudflare's app renders the preview URL into the
  // check's output summary. That summary is where the "Cloudflare Pages:
  // <project>" entry in the PR's check list gets its content. So it
  // exists whenever the deploy does.
  //
  // This section restricts itself to check runs owned by Cloudflare's
  // GitHub App, matching the bot-author restriction on source 4 below.
  // Posting a check run needs an installed app with write access — a far
  // higher bar than commenting. But the summary is still
  // attacker-influenced markdown, if any other app is installed. `pick()`
  // is the real backstop here. This check only narrows what reaches it.
  //
  // A run for the SIBLING project still counts as evidence, even though
  // this script (correctly) refuses its host as a URL. That run comes
  // from the same Cloudflare deploy trigger, and it lands a median 41
  // seconds before the app's own run. But it must never be the run this
  // script draws a CONCLUSION from. If `-design` succeeded while the
  // app's own build failed, the sibling's "(success)" would be the
  // misleading half of the story.
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

      // CANDIDATES may come from a run admitted on its NAME alone.
      // CONCLUSIONS may not. A name is self-declared, so an installed App
      // with `checks:write` could call itself "Cloudflare Pages:
      // sahajatlas". The three checks below would then rest on that
      // app's word, not Cloudflare's: which deployment is this commit's,
      // what the summary quotes, and whether the build FAILED. That last
      // check is the sharpest one. `failed` tells the reader "re-running
      // cannot help", so a forged one would produce a red Smoke check
      // nobody can clear. URLs are the safe half — `pick()` bounds them
      // to hosts only Cloudflare serves. That is why the name-only path
      // above still feeds the harvest, and keeps its resilience if the
      // app slug ever changes.
      //
      // This is the same rule as source 1's "both the context AND the
      // author".
      if (!/cloudflare/i.test(slug)) continue

      preferred = line
      // This is the deployment this commit produced, read straight from
      // the run GitHub returned for it. Last write wins here.
      // `/check-runs` defaults to `filter=latest`, which returns one run
      // per check NAME — unique per APP, not globally. That is the other
      // reason the gate above matters. An in-progress run may carry no
      // deployment yet. That case resolves to `null`, and the weaker
      // tiers cover the gap until a deployment appears.
      deployment = deploymentAlias(c.details_url)
      // Our project's deploy has finished, and it did not succeed.
      // `neutral` is Cloudflare's skipped-build conclusion, which is not
      // a failure.
      if (c.status === 'completed' && c.conclusion && !SUCCESS_CONCLUSIONS.has(c.conclusion)) {
        failure = line
      }
    }
  }

  // 4. PR comment from the Cloudflare bot, bot authors only. This repo is
  // public, so any GitHub user can comment on a PR. During the polling
  // window, a comment is often the only candidate on offer.
  //
  // Both the URL harvest and the evidence stay scoped to this SHA (issue
  // #138). Cloudflare keeps one comment per PR per project, and it edits
  // that comment in place, naming the short SHA it is deploying. So an
  // unscoped read would report a PREVIOUS commit's deploy as this one's.
  // That is not hypothetical: on PR #135 this comment still named
  // `9326e3b`, and it linked that commit's deploy, while the head was
  // `56c6b0d`. A comment naming some other commit harvests as `none`,
  // which no tier selects.
  //
  // The URL harvest now also requires the Cloudflare login, matching the
  // gate the evidence already used. Any installed app's bot could
  // otherwise contribute a candidate. `pick()` still bounds the damage to
  // hosts Cloudflare controls. But a discovery FALLBACK has no reason to
  // be wider than the integration it backs up.
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
    // This is worth naming only when it cost this script the poll.
    // Otherwise the better URL is already the story.
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
 * Describes what this poll is waiting on. A URL this script deliberately
 * did NOT take deserves a line of its own. Otherwise the log would read
 * as the script overlooking a URL sitting right there in the PR. That is
 * exactly how a correct refusal gets "fixed" by mistake.
 * @param {{ url: string | null, refused: string | null, evidence: string | null }} seen
 */
export function waitingLine({ url, refused, evidence }, sha = shortSha, host = project) {
  if (url) return `Preview URL ${url} not reachable yet — waiting…`

  // This reports both pieces, never only one. A poll can have a live
  // sibling run AND a stale comment at the same time. Dropping the
  // evidence half would lose the "a deploy exists" signal that separates
  // a slow build from an absent one.
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
    // This reads `failure` here, not only inside `discover()`. Without
    // this line, `timeoutStatus` could never return `failed`. That status
    // exists precisely so a broken build is not reported as a slow one —
    // yet it was unreachable in production, while its unit spec stayed
    // green. Issue #132's code review added the status, but nothing wired
    // it through to here.
    const { url, refused, evidence, failure } = await discover()
    if (url) lastUrl = url
    if (evidence) lastEvidence = evidence
    if (failure) lastFailure = failure
    if (refused) lastRefused = refused

    if (url && (await reachable(url))) {
      emit(url, STATUS.found)
      return
    }
    // This never sleeps past the deadline. The reported wait should
    // match the budget actually set, not the budget plus one trailing
    // poll interval.
    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    console.log(waitingLine({ url, refused, evidence: lastEvidence }))
    await sleep(Math.min(POLL_MS, remaining))
  }

  // `refused` rides along into the SUMMARY, not only the poll log. The
  // summary is the one line a reader actually sees. Without `refused`
  // there, `absent` would deny the very URL the log already named. This
  // value deliberately does not reach `timeoutStatus`, though. A URL
  // naming a different commit is evidence that some OTHER commit
  // deployed. It must not soften `absent` into "a deploy exists, re-run".
  const seen = {
    lastUrl,
    evidence: lastEvidence,
    failure: lastFailure,
    refused: lastUrl ? null : lastRefused,
  }
  const status = timeoutStatus(seen)
  emit('', status, explain(status, seen))
}

// This guard lets a test spec import the pure helpers without running
// discovery. It uses `realpathSync`, because `process.argv[1]` keeps a
// symlink's path, while `import.meta.url` resolves the target file.
// Invoked through a symlink, an unguarded check would silently read
// `false`. `main()` would then never run, and the step would exit 0 with
// no outputs. `ci.yml` would report that as "the deploy did not happen".
if (realpathSync(process.argv[1] || '') === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((err) => fail(`Discovery failed: ${err?.message || err}`))
}
