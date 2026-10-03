import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

// The production lane names two hosts that live elsewhere, inside a
// workflow expression no local run can evaluate: the domain it reads, and
// the Pages project whose check run fires it. Nothing couples either
// spelling to its source, and both failures are silent — the lane would
// read a host nobody embeds from, or wait on a check run nobody posts
// again. Silence is the thing issue #244 exists to end.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

/** A missing match must fail, not pass vacuously on `undefined`. */
const match = (text: string, re: RegExp) => {
  const found = re.exec(text)?.[1]

  expect(found, `nothing matched ${re}`).toBeTruthy()

  return found as string
}

describe('production-smoke.yml', () => {
  const lane = read('.github/workflows/production-smoke.yml')
  const target = match(lane, /^\s*PREVIEW_URL: .*\|\| '(\S+)' \}\}/m)

  // `docs/embedding.md` is the host-facing contract, so its table decides
  // which host "production" means. Reading the other one is how #148
  // stayed invisible: the two serve one build and two sets of headers.
  it('reads the host the embedding guide calls the production domain', () => {
    expect(target).toBe(match(read('docs/embedding.md'), /`(\S+)`\s*\|\s*the production domain/))
  })

  it('offers that same host as the hand-run default', () => {
    expect(match(lane, /^\s*default: (\S+)/m)).toBe(target)
  })

  // The trigger is the app project's Cloudflare build, never the `-design`
  // playground's, which deploys from this repo too. The slug comes from
  // `ci.yml`, by the derivation `get-cloudflare-preview-url.mjs` uses to
  // tell the two apart.
  it('waits on the Pages project ci.yml names', () => {
    const slug = match(read('.github/workflows/ci.yml'), /^\s*CF_PROJECT: (\S+)/m).split('.')[0]

    expect(match(lane, /check_run\.name == 'Cloudflare Pages: (\S+)'/)).toBe(slug)
  })
})
