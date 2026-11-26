import { describe, expect, it, vi } from 'vitest'

import { decodeApproxLocation } from '../src/lib/approx-location'

import { GEO_PLACEHOLDER } from './geo.mjs'

import worker, { handle } from './index'

const NOW = Date.UTC(2026, 10, 26, 12)
const PRAGUE = { country: 'CZ', city: 'Prague', latitude: '50.088', longitude: '14.4208' }
const LOADER = `const g="${GEO_PLACEHOLDER}";boot(g)`

/** An asset binding answering every path with one file, recording what it was asked. */
const assets = (body: string, contentType = 'text/javascript', status = 200) => {
  const asked: Request[] = []

  return {
    asked,
    env: {
      ASSETS: {
        fetch: vi.fn(async (request: Request) => {
          asked.push(request)

          return new Response(status === 304 ? null : body, {
            status,
            headers: {
              'content-type': contentType,
              etag: '"abc"',
              'cache-control': 'public, max-age=0, must-revalidate',
            },
          })
        }),
      },
    },
  }
}

const request = (path: string, init: RequestInit & { cf?: Record<string, unknown> } = {}) =>
  Object.assign(new Request(`https://sahajatlas.com${path}`, init), { cf: init.cf })

const token = (text: string) => /g="([^"]*)"/.exec(text)?.[1]

describe('the app Worker', () => {
  it('writes the visitor’s location into loader.js', async () => {
    const { env } = assets(LOADER)
    const response = await handle(request('/loader.js', { cf: PRAGUE }), env, NOW)

    expect(decodeApproxLocation(token(await response.text()), NOW)).toEqual({
      countryCode: 'CZ',
      place: { city: 'Prague', center: [14.4208, 50.088] },
    })
  })

  it('serves it per visitor: never stored, never revalidated against another copy', async () => {
    const { env } = assets(LOADER)
    const response = await handle(request('/loader.js', { cf: PRAGUE }), env, NOW)

    expect(response.headers.get('cache-control')).toBe('private, max-age=0, no-store')
    expect(response.headers.get('etag')).toBeNull()
  })

  // A 304 would hand the browser back a copy holding someone else's town, or none.
  it('never lets the asset layer answer a conditional request', async () => {
    const { env, asked } = assets(LOADER)

    await handle(
      request('/loader.js', { cf: PRAGUE, headers: { 'if-none-match': '"abc"' } }),
      env,
      NOW,
    )

    expect(asked[0].headers.get('if-none-match')).toBeNull()
  })

  // `public/_headers` does not reach a Worker-built response, and without CORS a module script
  // on a host page never loads (#91).
  it('carries the site-wide CORS and noindex itself', async () => {
    for (const [body, type] of [
      [LOADER, 'text/javascript'],
      ['{}', 'application/json'],
    ]) {
      const response = await handle(
        request('/loader.js', { cf: PRAGUE }),
        assets(body, type).env,
        NOW,
      )

      expect(response.headers.get('access-control-allow-origin')).toBe('*')
      expect(response.headers.get('x-robots-tag')).toBe('noindex')
    }
  })

  it('writes into the standalone page too', async () => {
    const page = `<meta name="sy-atlas-geo" content="${GEO_PLACEHOLDER}" />`
    const { env } = assets(page, 'text/html; charset=utf-8')
    const response = await handle(request('/', { cf: PRAGUE }), env, NOW)
    const written = /content="([^"]*)"/.exec(await response.text())?.[1]

    expect(decodeApproxLocation(written, NOW)?.place?.city).toBe('Prague')
  })

  it('serves the file as built when Cloudflare knows nothing', async () => {
    const { env } = assets(LOADER)
    const response = await handle(request('/loader.js', { cf: { country: 'XX' } }), env, NOW)

    expect(await response.text()).toBe(LOADER)
  })

  it('passes through what it does not write into', async () => {
    const { env } = assets('png', 'image/png')
    const response = await handle(request('/loader.js', { cf: PRAGUE }), env, NOW)

    expect(await response.text()).toBe('png')
    expect(response.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate')
  })

  it('falls back to the asset as built when anything throws', async () => {
    const { env } = assets(LOADER)
    const broken = request('/loader.js', { cf: PRAGUE })

    Object.defineProperty(broken, 'cf', {
      get: () => {
        throw new Error('no cf')
      },
    })

    const response = await worker.fetch(broken, env)

    expect(await response.text()).toBe(LOADER)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
  })
})
