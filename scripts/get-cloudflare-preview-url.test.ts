import { describe, expect, it } from 'vitest'

import {
  PROVENANCE,
  STATUS,
  deploymentAlias,
  explain,
  formatElapsed,
  note,
  pick,
  pickPreview,
  provenanceOf,
  timeoutFrom,
  timeoutStatus,
  waitingLine,
} from './get-cloudflare-preview-url.mjs'

const HOST = 'sahajatlas.pages.dev'

// This is PR #135, verbatim, because it is the case the ranking exists for. The head was
// 56c6b0d and deployed to a73c3b0c. The Cloudflare comment for this project was last edited
// naming 9326e3b and still linked THAT commit's deploy, 6b78e192.
const DEPLOY = `https://a73c3b0c.${HOST}`
const BRANCH = `https://fix-report-form-delivery.${HOST}`
const STALE = `https://6b78e192.${HOST}`
const DEPLOY_ID = 'a73c3b0c'

/** @see provenanceOf — `scope` is where a URL was read, not what it looks like. */
const from = (scope: 'commit' | 'pr' | 'none', ...urls: string[]) =>
  urls.map((url) => ({ url, scope }))

describe('pick', () => {
  it('accepts the project host and its deployment subdomains', () => {
    expect(pick([`https://${HOST}`], HOST)).toBe(`https://${HOST}`)
    expect(pick([`https://2bdf873b.${HOST}`], HOST)).toBe(`https://2bdf873b.${HOST}`)
    expect(pick([`https://feat-noindex-standalone.${HOST}`], HOST)).toBe(
      `https://feat-noindex-standalone.${HOST}`,
    )
  })

  it('refuses a host that merely CONTAINS the project name', () => {
    // This pins the security property: `pages.dev` subdomains are
    // first-come-first-served, and source 4 scrapes URLs out of bot
    // comments — so a substring match would let a bot belonging to any
    // installed GitHub App aim the smoke lane at a host somebody else
    // controls, and collect a green check that verified nothing. Matching
    // is on the hostname, at a label boundary.
    expect(pick(['https://evil-sahajatlas.pages.dev'], HOST)).toBeNull()
    expect(pick(['https://sahajatlas.pages.dev.evil.com'], HOST)).toBeNull()
    expect(pick([`https://${HOST}@evil.com/`], HOST)).toBeNull()
  })

  it('refuses the sibling Ladle project, whose deploy is not what we smoke-test', () => {
    expect(pick(['https://abc.sahajatlas-design.pages.dev'], HOST)).toBeNull()
  })

  it('matches case-insensitively in both directions', () => {
    // PAGES_RE carries the `i` flag, so an uppercase URL can reach pick().
    // and CF_PROJECT is hand-typed, so the configured host can carry one
    // too. Both sides normalise — a "harden the match" refactor must not
    // drop either.
    expect(pick([`https://ABC.SahajAtlas.PAGES.DEV`], HOST)).toBe(
      'https://ABC.SahajAtlas.PAGES.DEV',
    )
    expect(pick([`https://abc.${HOST}`], 'SahajAtlas.Pages.Dev')).toBe(`https://abc.${HOST}`)
  })

  it('skips unparseable candidates rather than throwing', () => {
    expect(pick(['not a url', `https://${HOST}`], HOST)).toBe(`https://${HOST}`)
    expect(pick([], HOST)).toBeNull()
  })
})

describe('deploymentAlias', () => {
  // This is the chain that makes selection a fact: GitHub returned this check run for the
  // head SHA, the run points at a deployment UUID, and Cloudflare's per-deployment alias is
  // that UUID's first 8 characters. Nothing here is a shape heuristic.
  it('reduces a dashboard link to the alias its deployment serves', () => {
    expect(
      deploymentAlias(
        'https://dash.cloudflare.com/?to=/c66c53a/pages/view/sahajatlas/a73c3b0c-df19-4049-ac2b-bcf72bcc83b0',
      ),
    ).toBe(DEPLOY_ID)
  })

  it('is null when there is no deployment to read', () => {
    expect(deploymentAlias('https://dash.cloudflare.com/?to=/pages/view/sahajatlas')).toBeNull()
    expect(deploymentAlias(undefined)).toBeNull()
  })

  // The docblock says "ends in", so the LAST uuid is the deployment. An earlier uuid-shaped
  // path segment winning would name a host that exists nowhere.
  it('reads the last uuid, not the first', () => {
    expect(
      deploymentAlias(
        'https://dash.cloudflare.com/11111111-2222-3333-4444-555555555555/pages/view/sahajatlas/a73c3b0c-df19-4049-ac2b-bcf72bcc83b0',
      ),
    ).toBe(DEPLOY_ID)
  })
})

describe('waitingLine', () => {
  // A refused URL and live evidence are not alternatives — a poll can have a sibling run
  // building AND a stale comment, and showing only the refusal drops the "a deploy exists"
  // half that separates slow from absent.
  it('reports the refusal and the evidence together', () => {
    const line = waitingLine(
      {
        url: null,
        refused: `https://6b78e192.${HOST}`,
        evidence: 'check run "…-design" (success)',
      },
      '56c6b0d',
      HOST,
    )

    expect(line).toContain('6b78e192')
    expect(line).toContain('56c6b0d')
    expect(line).toContain('-design')
  })

  it('says only that nothing turned up when nothing did', () => {
    const line = waitingLine({ url: null, refused: null, evidence: null }, '56c6b0d', HOST)

    expect(line).toContain('No sahajatlas.pages.dev preview URL yet')
    expect(line).not.toContain('ignoring')
  })
})

describe('provenanceOf', () => {
  it('ranks the deployment our check run names above everything', () => {
    expect(provenanceOf({ url: DEPLOY, scope: 'commit' }, DEPLOY_ID)).toBe(PROVENANCE.deployment)
    // Even reached by the weakest source: the id is Cloudflare's own answer
    // to "which host is this commit", so where we read it changes nothing.
    expect(provenanceOf({ url: DEPLOY, scope: 'none' }, DEPLOY_ID)).toBe(PROVENANCE.deployment)
  })

  it('separates a deploy alias from a branch alias within one per-SHA source', () => {
    expect(provenanceOf({ url: DEPLOY, scope: 'commit' })).toBe(PROVENANCE.attested)
    expect(provenanceOf({ url: BRANCH, scope: 'commit' })).toBe(PROVENANCE.alias)
  })

  // This is the defect this ticket is about. A comment naming a different commit is worth
  // nothing, no matter how convincing the URL in it looks — 6b78e192 is perfectly
  // deploy-shaped, and it is another commit's build.
  it('refuses anything from a comment that names a different commit', () => {
    expect(provenanceOf({ url: STALE, scope: 'none' })).toBe(PROVENANCE.loose)
    expect(provenanceOf({ url: BRANCH, scope: 'none' })).toBe(PROVENANCE.loose)
  })

  // The bare project host is PRODUCTION. It clears `pick()` and is not deploy-shaped, so it
  // would otherwise sit on the floor beside a branch alias — but this script only runs for a
  // PR head, so production is never right.
  it('refuses the bare project host, which is production rather than a preview', () => {
    expect(provenanceOf({ url: `https://${HOST}`, scope: 'commit' })).toBe(PROVENANCE.loose)
    expect(pickPreview(from('commit', `https://${HOST}`), { host: HOST })).toBeNull()
  })

  it('ranks a comment BELOW the check run even when its URL is deploy-shaped', () => {
    // The comment is edited in place per deploy, and we cannot see
    // retrospectively whether Cloudflare blanks its URL cells mid-build —
    // so a body naming the head might still show the previous deploy's
    // link. The check run therefore has to WIN that race, rather than tie
    // it. This is asserted as an ordering, not a constant, so renaming a
    // tier cannot quietly invert it.
    expect(provenanceOf({ url: DEPLOY, scope: 'pr' })).toBe(PROVENANCE.claimed)
    expect(PROVENANCE.claimed).toBeLessThan(PROVENANCE.attested)

    // The race that matters: two deploy aliases, one from each source.
    const fromCheckRun = `https://9260ebb2.${HOST}`

    expect(
      pickPreview([...from('pr', DEPLOY), ...from('commit', fromCheckRun)], { host: HOST }),
    ).toBe(fromCheckRun)
  })

  it('still prefers a comment DEPLOY alias over a bare branch alias', () => {
    // `claimed` sits above `alias`, not below it: a deploy alias names one
    // immutable build and the comment vouches for the head commit, whereas
    // a branch alias is pinned to nothing at all. This is the path that
    // runs if Cloudflare ever drops the per-deploy URL from the check-run
    // summary.
    expect(pickPreview([...from('commit', BRANCH), ...from('pr', DEPLOY)], { host: HOST })).toBe(
      DEPLOY,
    )
  })
})

describe('pickPreview', () => {
  // This is the acceptance criterion, stated as a test: both URLs are in the same check-run
  // summary and only one of them is pinned to this commit.
  it('does not take the branch alias when the head commit has a deploy alias', () => {
    expect(pickPreview(from('commit', BRANCH, DEPLOY), { host: HOST, deployment: DEPLOY_ID })).toBe(
      DEPLOY,
    )
    // Order must not decide it — the old code returned whichever came first.
    expect(pickPreview(from('commit', DEPLOY, BRANCH), { host: HOST, deployment: DEPLOY_ID })).toBe(
      DEPLOY,
    )
  })

  it('still prefers a deploy alias before the deployment id is known', () => {
    // This is the in-build window: the run exists but carries no deployment
    // yet.
    expect(pickPreview(from('commit', BRANCH, DEPLOY), { host: HOST })).toBe(DEPLOY)
  })

  it('returns nothing when the only offer is a comment about another commit', () => {
    // This reproduces PR #135. The old `pick()` answered `found` here, and
    // the smoke lane would have gone green having tested 9326e3b's build.
    expect(pickPreview(from('none', STALE, BRANCH), { host: HOST })).toBeNull()
  })

  it('keeps the branch alias as a floor, so a format change degrades rather than reddens', () => {
    // If Cloudflare ever stops printing the per-deploy URL, discovery
    // should get worse, not stop: #99 hard-fails a same-repo PR on an
    // empty result.
    expect(pickPreview(from('commit', BRANCH), { host: HOST })).toBe(BRANCH)
    // A comment that DOES name the head is the weakest usable source. Note
    // this deliberately is not STALE — that constant is another commit's
    // deploy, and reusing it here would read as "we accept another
    // commit's build".
    expect(pickPreview(from('pr', BRANCH), { host: HOST })).toBe(BRANCH)
  })

  // This is the tie-break the ticket exists to remove, one level down: inside a single
  // comment, both URLs are `pr`-scope, so if deploy-shape were only read for per-SHA
  // sources, then whichever Cloudflare happened to print first would win.
  it('does not let a single comment markdown order decide between its two URLs', () => {
    expect(pickPreview(from('pr', BRANCH, DEPLOY), { host: HOST })).toBe(DEPLOY)
    expect(pickPreview(from('pr', DEPLOY, BRANCH), { host: HOST })).toBe(DEPLOY)
  })

  it('follows the configured host when refusing production, not a module-level copy', () => {
    // provenanceOf derives the production label from the host it is GIVEN,
    // so a different CF_PROJECT refuses its own bare host rather than this
    // one.
    const design = 'sahajatlas-design.pages.dev'

    expect(pickPreview(from('commit', `https://${design}`), { host: design })).toBeNull()
  })

  it('leaves the host gate exactly where it was', () => {
    // Ranking chooses among URLs `pick()` accepts. It must never reach
    // past it. A lookalike is refused at the strongest tier as firmly as
    // at the weakest.
    const evil = 'https://evil-sahajatlas.pages.dev'

    expect(pickPreview(from('commit', evil), { host: HOST })).toBeNull()
    expect(
      pickPreview(from('commit', evil), { host: HOST, deployment: 'evil-sahajatlas' }),
    ).toBeNull()
  })
})

describe('timeoutFrom', () => {
  // A bad override must be IGNORED, not honoured. Read as seconds,
  // PREVIEW_TIMEOUT_MS=600 is a 0.6s deadline — one poll, then a confident
  // "the deploy did not happen" about a build that was never given time.
  it('ignores anything that is not a positive number', () => {
    const fallback = timeoutFrom(undefined)

    expect(fallback).toBe(600_000)
    for (const bad of ['', '0', '-5', 'abc', '10m', 'NaN']) {
      expect(timeoutFrom(bad)).toBe(fallback)
    }
  })

  it('honours a positive override, capped', () => {
    expect(timeoutFrom('90000')).toBe(90_000)
    expect(timeoutFrom('1e9', 720_000)).toBe(720_000)
  })
})

describe('timeoutStatus', () => {
  // `absent` (nothing happened) and `failed` (it happened and broke) both want a human.
  // `pending` / `unreachable` mean we stopped waiting on a deploy that demonstrably exists,
  // which wants a re-run (issue #132).
  it('reports a URL that never answered as unreachable', () => {
    expect(timeoutStatus({ lastUrl: `https://x.${HOST}`, evidence: null })).toBe(STATUS.unreachable)
  })

  it('reports positive Cloudflare evidence without a URL as pending', () => {
    expect(timeoutStatus({ lastUrl: null, evidence: 'check run "…-design" (success)' })).toBe(
      STATUS.pending,
    )
  })

  it('reports no signal at all as absent', () => {
    expect(timeoutStatus({ lastUrl: null, evidence: null })).toBe(STATUS.absent)
  })

  // This is the case that makes the distinction worth having. A FAILED build still posts a
  // check run, so counting that as "a deploy exists" would tell the reader to re-run a job
  // that fails identically — the very habit the ticket set out to break. It outranks both
  // other signals.
  it('reports a finished-and-failed deploy as failed, over any other signal', () => {
    const failure = 'check run "Cloudflare Pages: sahajatlas" (failure)'

    expect(timeoutStatus({ lastUrl: null, evidence: null, failure })).toBe(STATUS.failed)
    expect(timeoutStatus({ lastUrl: null, evidence: 'sibling (success)', failure })).toBe(
      STATUS.failed,
    )
    expect(timeoutStatus({ lastUrl: `https://x.${HOST}`, evidence: null, failure })).toBe(
      STATUS.failed,
    )
  })
})

describe('explain', () => {
  // The two cases must not read alike: one asks for a re-run, the other for an
  // investigation, and ci.yml relays whichever it is told.
  it('tells the reader to re-run when a deploy was seen', () => {
    for (const status of [STATUS.pending, STATUS.unreachable]) {
      const message = explain(status, {
        lastUrl: `https://x.${HOST}`,
        evidence: 'check run "Cloudflare Pages: sahajatlas-design" (success)',
      })

      expect(message).toContain('re-run')
    }
  })

  it('tells the reader nothing turned up when there was no signal', () => {
    const message = explain(STATUS.absent, { lastUrl: null, evidence: null })

    expect(message).toContain('no Cloudflare signal')
    expect(message).not.toContain('re-run')
  })

  // Without this, the `absent` sentence ("no check run, no deployment, no bot comment") is
  // contradicted by the poll line printed seconds earlier naming the URL we declined — and
  // the summary is the line a reader actually sees.
  it('names a refused URL rather than denying it existed', () => {
    const message = explain(STATUS.absent, { lastUrl: null, evidence: null, refused: STALE })

    expect(message).toContain(STALE)
    expect(message).toContain('names a different commit')
    // Still the loud branch: another commit's URL is not evidence THIS one built.
    expect(message).not.toContain('re-run')
  })

  it('tells the reader a failed build explicitly CANNOT be fixed by re-running', () => {
    const message = explain(STATUS.failed, { failure: 'check run "x" (failure)' })

    expect(message).toContain('re-running this job cannot help')
    expect(message).toContain('Cloudflare deployment log')
  })

  it('leaves the elapsed wait to the caller that prefixes every line with it', () => {
    const messages = [STATUS.pending, STATUS.unreachable, STATUS.absent].map((status) =>
      explain(status, { lastUrl: `https://x.${HOST}`, evidence: 'check run' }),
    )

    for (const message of messages) expect(message).not.toMatch(/\d+m\d+s|\b\d+s\b/)
  })
})

describe('note', () => {
  // Source 3 accepts a check run whose NAME starts with "cloudflare pages" from any
  // installed app, and that name is quoted into the step summary — so a newline in it would
  // forge a summary line. `report()` only defangs a leading `::`, which a forged line placed
  // mid-string would sail past.
  it('flattens a multi-line name onto one line', () => {
    expect(note('Cloudflare Pages: x\n::error::forged')).toBe('Cloudflare Pages: x ::error::forged')
    expect(note('  a \r\n\t b  ')).toBe('a b')
  })

  it('caps the length so one name cannot swamp the summary', () => {
    expect(note('x'.repeat(500))).toHaveLength(120)
  })
})

describe('formatElapsed', () => {
  it('reads as minutes and zero-padded seconds past a minute', () => {
    expect(formatElapsed(45_000)).toBe('45s')
    expect(formatElapsed(64_000)).toBe('1m04s')
    expect(formatElapsed(600_000)).toBe('10m00s')
    expect(formatElapsed(-1)).toBe('0s')
  })
})
