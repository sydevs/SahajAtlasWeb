#!/usr/bin/env node

/**
 * Discover the Cloudflare Pages preview URL for a PR and wait until it's
 * reachable, then expose it as the `preview_url` GitHub Actions output.
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
 * bot's comment is best-effort: it appeared on #121 and never on #120, whose
 * deploy was otherwise healthy. That made the smoke gate flaky by construction,
 * and since #99 made a missing preview HARD-FAIL a same-repo PR, the flake
 * presented as a red check on a good commit. The check run, meanwhile, is the
 * same object the "Cloudflare Pages: …" entry in the PR's check list comes from,
 * so it is present exactly when the deploy is.
 *
 * If nothing is found within the timeout (e.g. a forked PR with no preview, or
 * the preview env isn't configured), we emit an EMPTY preview_url and exit 0 —
 * discovery problems are reported, never fatal here.
 *
 * Whether an empty result is tolerable is the WORKFLOW's call, not this script's:
 * ci.yml annotates it either way, and fails the smoke job when the PR is
 * same-repo (secrets present, so a preview was expected). Keep the two in step —
 * exiting non-zero here would turn a fork's expected skip into a red check.
 *
 * Env:
 *   GITHUB_TOKEN       (required) — read access to statuses/deployments/issues
 *   GITHUB_REPOSITORY  (auto in Actions) — "owner/repo"
 *   PR_HEAD_SHA        (required) — the PR head commit
 *   PR_NUMBER          (optional) — enables the PR-comment fallback
 *   CF_PROJECT         (optional) — prefer URLs containing this project slug
 */

import { appendFileSync } from 'node:fs'

const token = process.env.GITHUB_TOKEN
const repo = process.env.GITHUB_REPOSITORY
const sha = process.env.PR_HEAD_SHA
const prNumber = process.env.PR_NUMBER
const project = process.env.CF_PROJECT || 'sahajatlas.pages.dev' // the app's *.pages.dev host (not the -design playground)

const TIMEOUT_MS = 6 * 60_000 // give Cloudflare time to build + post the URL
const POLL_MS = 15_000
const PAGES_RE = /https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pages\.dev/gi

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function fail(msg) {
  console.error(msg)
  emit('')
  process.exit(0) // skip gracefully — never fail the job on discovery problems
}

function emit(url) {
  console.log(
    url ? `Found preview URL: ${url}` : 'No preview URL found — smoke specs will be skipped.',
  )
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `preview_url=${url}\n`)
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
function pick(urls) {
  return (
    urls.find((u) => {
      try {
        const { hostname } = new URL(u)

        return hostname === project || hostname.endsWith(`.${project}`)
      } catch {
        return false
      }
    }) || null
  )
}

async function discover() {
  const urls = []

  // 1. commit statuses
  const statuses = await gh(`/repos/${repo}/commits/${sha}/statuses`)
  if (Array.isArray(statuses)) {
    for (const s of statuses) {
      if (s.target_url) urls.push(...(s.target_url.match(PAGES_RE) || []))
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
  const checks = await gh(`/repos/${repo}/commits/${sha}/check-runs?per_page=100`)
  if (Array.isArray(checks?.check_runs)) {
    for (const c of checks.check_runs) {
      const slug = c.app?.slug || ''
      if (!/cloudflare/i.test(slug) && !/^cloudflare pages/i.test(c.name || '')) continue
      urls.push(...((c.output?.summary || '').match(PAGES_RE) || []))
      if (c.details_url) urls.push(...(c.details_url.match(PAGES_RE) || []))
    }
  }

  // 4. PR comment from the Cloudflare bot — bot authors only. This repo is
  // public, so any GitHub user can comment on a PR, and during the polling
  // window a comment is often the only candidate on offer.
  if (prNumber) {
    const comments = await gh(`/repos/${repo}/issues/${prNumber}/comments`)
    if (Array.isArray(comments)) {
      for (const c of comments) {
        if (c.user?.type !== 'Bot') continue
        urls.push(...((c.body || '').match(PAGES_RE) || []))
      }
    }
  }

  return pick([...new Set(urls)])
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

  const deadline = Date.now() + TIMEOUT_MS
  let url = null

  while (Date.now() < deadline) {
    url = await discover()
    if (url && (await reachable(url))) {
      emit(url)
      return
    }
    if (url) {
      console.log(`Preview URL ${url} not reachable yet — waiting…`)
    } else {
      console.log('Preview URL not posted yet — waiting…')
    }
    await sleep(POLL_MS)
  }

  emit('') // timed out — skip gracefully
}

main().catch((err) => fail(`Discovery failed: ${err?.message || err}`))
