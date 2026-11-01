import { describe, expect, it } from 'vitest'

import {
  CHALLENGE_CHANNEL,
  challengeMessage,
  challengeOrigin,
  challengeSrc,
  parseChallengeCommand,
  parseChallengeEvent,
  readChallengeOptions,
} from './turnstile-frame'

/**
 * The frame protocol, in the node lane. The transport is spec'd in `use-turnstile.test.tsx`,
 * which needs a DOM; everything here is a string.
 */

// What `import.meta.url` is inside a built chunk: the widget's own graph, under /assets/.
const CHUNK = 'https://sahajatlas.com/assets/use-turnstile-a1b2c3.js'

describe('challengeSrc', () => {
  it('resolves to the challenge page at the ROOT of the chunk-s own origin', () => {
    const url = new URL(challengeSrc(CHUNK, { theme: 'dark', language: 'cs' }))

    // The whole fix turns on this origin being ours rather than the host page's (#343), and
    // on the path being the output root rather than the chunk's own directory — Vite emits
    // an HTML input there, so `/assets/challenge.html` would 404 into the SPA fallback.
    expect(url.origin).toBe('https://sahajatlas.com')
    expect(url.pathname).toBe('/challenge.html')
  })

  it('carries the theme and language the widget is rendering in', () => {
    const url = new URL(challengeSrc(CHUNK, { theme: 'dark', language: 'cs' }))

    expect(url.searchParams.get('theme')).toBe('dark')
    expect(url.searchParams.get('language')).toBe('cs')
    expect(url.searchParams.get('probe')).toBeNull()
  })

  it('marks a probe frame, so it hands back the handshake and renders nothing', () => {
    const url = new URL(challengeSrc(CHUNK, { theme: 'auto', language: 'auto', probe: true }))

    expect(url.searchParams.get('probe')).toBe('1')
  })

  it.each([
    ['a dev server', 'http://localhost:5174/src/hooks/use-turnstile.ts'],
    ['a Workers preview', 'https://pr-9-sahajatlas.sydevs.workers.dev/assets/x.js'],
  ])('follows the origin the bundle was served from — %s', (_label, moduleUrl) => {
    const expected = new URL(moduleUrl).origin

    expect(new URL(challengeSrc(moduleUrl, { theme: 'auto', language: 'en' })).origin).toBe(
      expected,
    )
    expect(challengeOrigin(moduleUrl)).toBe(expected)
  })
})

describe('readChallengeOptions', () => {
  it('reads what the widget sent', () => {
    expect(readChallengeOptions('?theme=dark&language=ru&probe=1')).toEqual({
      theme: 'dark',
      language: 'ru',
      probe: true,
    })
  })

  it.each([
    ['an unknown theme', '?theme=sepia&language=en', 'auto', 'en'],
    ['no theme at all', '?language=en', 'auto', 'en'],
    // A language Turnstile would refuse, or one carrying anything but a locale code, must not
    // stop the challenge rendering: `auto` follows the browser, which is a worse answer than
    // the widget's own locale and a far better one than no captcha.
    ['a non-locale language', '?theme=light&language=klingon', 'light', 'auto'],
    ['an empty query', '', 'auto', 'auto'],
  ])('falls back rather than refusing, given %s', (_label, search, theme, language) => {
    expect(readChallengeOptions(search)).toEqual({ theme, language, probe: false })
  })

  it('treats any probe value but 1 as a real challenge', () => {
    expect(readChallengeOptions('?probe=0').probe).toBe(false)
    expect(readChallengeOptions('?probe=true').probe).toBe(false)
  })
})

describe('parseChallengeEvent', () => {
  const on = (message: Record<string, unknown>) => ({ channel: CHALLENGE_CHANNEL, ...message })

  it.each(['ready', 'expired', 'error'])('reads %s', (type) => {
    expect(parseChallengeEvent(on({ type }))).toEqual({ type })
  })

  it('reads a token', () => {
    expect(parseChallengeEvent(on({ type: 'token', token: 'tok' }))).toEqual({
      type: 'token',
      token: 'tok',
    })
  })

  it.each([
    // The host page's own cross-frame traffic, which this shape is indistinguishable from
    // without the channel marker.
    ['no channel', { type: 'token', token: 'tok' }],
    ['another channel', { channel: 'other-widget', type: 'token', token: 'tok' }],
    ['an unknown type', on({ type: 'solved' })],
    // An empty token would enable Submit and then fail verification, which reads to a visitor
    // as the form being broken rather than the challenge.
    ['an empty token', on({ type: 'token', token: '' })],
    ['a non-string token', on({ type: 'token', token: 42 })],
    ['no token', on({ type: 'token' })],
    ['a string', 'ready'],
    ['null', null],
  ])('refuses %s', (_label, data) => {
    expect(parseChallengeEvent(data)).toBeNull()
  })
})

describe('parseChallengeCommand', () => {
  it('reads a reset', () => {
    expect(parseChallengeCommand(challengeMessage({ type: 'reset' }))).toEqual({ type: 'reset' })
  })

  it.each([
    ['an unchannelled reset', { type: 'reset' }],
    // The page accepts commands, not events: a `token` echoed back at it is not one.
    ['an event', { channel: CHALLENGE_CHANNEL, type: 'token', token: 'tok' }],
    ['null', null],
  ])('refuses %s', (_label, data) => {
    expect(parseChallengeCommand(data)).toBeNull()
  })
})

describe('challengeMessage', () => {
  it('stamps the channel on everything either side sends', () => {
    expect(challengeMessage({ type: 'token', token: 'tok' })).toEqual({
      channel: CHALLENGE_CHANNEL,
      type: 'token',
      token: 'tok',
    })
  })
})
