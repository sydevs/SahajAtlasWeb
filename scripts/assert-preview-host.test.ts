import { describe, expect, it } from 'vitest'

import { WORKERS_SUBDOMAIN, appPreviewHost } from './assert-preview-host.mjs'
import { appWorkerName } from './_wrangler-config.mjs'

// The security property the Pages-era discovery spec held, carried over by #282. It got
// stronger in the move, and the provenance ranking it needed went away with the scraping: the
// address now comes from our own publish step, so nothing is read out of text anyone can edit
// (#122, #138). What survives is the question of WHICH Worker an address names, and three of the
// refusals below are that spec's in their Workers spelling.
const WORKER = appWorkerName()
const PREVIEW = `https://pr-1-${WORKER}.${WORKERS_SUBDOMAIN}`

describe('appPreviewHost', () => {
  it('accepts a preview of the app Worker, by preview name and by version', () => {
    expect(appPreviewHost(PREVIEW, WORKER)).toBe(`pr-1-${WORKER}.${WORKERS_SUBDOMAIN}`)
    expect(appPreviewHost(`https://a1b2c3d4-${WORKER}.${WORKERS_SUBDOMAIN}`, WORKER)).toBe(
      `a1b2c3d4-${WORKER}.${WORKERS_SUBDOMAIN}`,
    )
  })

  // ⚠ The whole reason the match anchors the worker-name label at its LEFT end too: a preview
  // host is `<preview>-<worker>.<subdomain>.workers.dev`, and `sahajatlas-design` carries
  // `sahajatlas` as a prefix. A bare substring or an unanchored regex accepts this.
  it('refuses the sibling Ladle playground, whose deploy is not what we smoke-test', () => {
    expect(appPreviewHost(`https://pr-1-${WORKER}-design.${WORKERS_SUBDOMAIN}`, WORKER)).toBeNull()
  })

  it('refuses a label that merely ENDS with the Worker name', () => {
    expect(appPreviewHost(`https://pr-1-not${WORKER}.${WORKERS_SUBDOMAIN}`, WORKER)).toBeNull()
  })

  it('refuses our host as a prefix of somebody else’s domain', () => {
    expect(appPreviewHost(`${PREVIEW}.evil.com`, WORKER)).toBeNull()
    expect(appPreviewHost(`https://pr-1-${WORKER}.evil-c66.workers.dev`, WORKER)).toBeNull()
  })

  // ⚠ The right end is an equality, never a suffix test: one more label in front of the account
  // subdomain is the same hazard as one more behind it, and only an `endsWith` accepts it.
  it('refuses a label inserted before the account subdomain', () => {
    expect(appPreviewHost(`https://pr-1-${WORKER}.sub.${WORKERS_SUBDOMAIN}`, WORKER)).toBeNull()
  })

  // This one parses, and `new URL(…).hostname` is `evil.com`. It is in the carried-over set
  // because a hand-rolled `startsWith` on the raw string accepts it.
  it('refuses a credential form that hides the real host', () => {
    expect(appPreviewHost(`${PREVIEW}@evil.com/`, WORKER)).toBeNull()
  })

  // The bare worker label is the Worker's own `workers.dev` host — production, not a preview of
  // it. Pages-era discovery refused the bare project host for the same reason, and
  // `tests/smoke/boot-origins.smoke.test.ts` still rests on the lane only ever reading a
  // preview.
  it('refuses the Worker’s own production host', () => {
    expect(appPreviewHost(`https://${WORKER}.${WORKERS_SUBDOMAIN}`, WORKER)).toBeNull()
    expect(appPreviewHost(`https://-${WORKER}.${WORKERS_SUBDOMAIN}`, WORKER)).toBeNull()
  })

  it('refuses a plaintext preview, and anything unparseable', () => {
    expect(appPreviewHost(PREVIEW.replace('https:', 'http:'), WORKER)).toBeNull()
    expect(appPreviewHost('not a url', WORKER)).toBeNull()
    expect(appPreviewHost('', WORKER)).toBeNull()
  })

  // The configured subdomain is hand-typed and a hostname is case-insensitive, so both sides
  // normalise. A "harden the match" refactor must not drop either direction.
  it('matches case-insensitively in both directions', () => {
    expect(appPreviewHost(PREVIEW.toUpperCase().replace('HTTPS', 'https'), WORKER)).toBe(
      `pr-1-${WORKER}.${WORKERS_SUBDOMAIN}`,
    )
    expect(appPreviewHost(PREVIEW, WORKER.toUpperCase(), WORKERS_SUBDOMAIN.toUpperCase())).toBe(
      `pr-1-${WORKER}.${WORKERS_SUBDOMAIN}`,
    )
  })
})
