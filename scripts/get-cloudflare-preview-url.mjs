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
 *   3. the Cloudflare bot's PR comment body
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

  // 3. PR comment from the Cloudflare bot — bot authors only. This repo is
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
