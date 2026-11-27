import { describe, expect, it, vi } from 'vitest'

import worker from './index'

const PRAGUE = { country: 'CZ', city: 'Prague', latitude: '50.0880', longitude: '14.4208' }

const env = () => ({ ASSETS: { fetch: vi.fn(async () => new Response('asset')) } })

const request = (path: string, cf?: Record<string, unknown>) =>
  Object.assign(new Request(`https://sahajatlas.com${path}`), { cf })

describe('the app Worker', () => {
  it('serves /geo.js as a module of the visitor’s location', async () => {
    const response = await worker.fetch(request('/geo.js', PRAGUE), env())

    expect(response.headers.get('content-type')).toMatch(/javascript/)
    expect(await response.text()).toBe(
      'export default {"countryCode":"CZ","place":{"city":"Prague","center":[14.4208,50.088]}}\n',
    )
  })

  it('serves it per visitor: never stored by a browser or a shared cache', async () => {
    const response = await worker.fetch(request('/geo.js', PRAGUE), env())

    expect(response.headers.get('cache-control')).toBe('private, max-age=0, no-store')
  })

  // `public/_headers` does not reach a Worker-built response, and a host page's import of it is a
  // CORS request.
  it('carries the site-wide CORS and noindex itself', async () => {
    const response = await worker.fetch(request('/geo.js'), env())

    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('x-robots-tag')).toBe('noindex')
  })

  it('leaves every other path to the assets', async () => {
    const assets = env()
    const response = await worker.fetch(request('/loader.js', PRAGUE), assets)

    expect(await response.text()).toBe('asset')
    expect(assets.ASSETS.fetch).toHaveBeenCalledOnce()
  })
})
