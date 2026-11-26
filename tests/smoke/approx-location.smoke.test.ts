import { describe, expect, test } from 'vitest'

import { GEO_PLACEHOLDER } from '../../worker/geo.mjs'

import { fetchPreview, skipWithoutPreview } from './_helpers/preview'

// Does the deployed app Worker write the visitor's approximate location into the two files it
// routes, and serve them per visitor? A deploy-time fact: the unit lane holds the Worker's code
// against a fake asset binding, but only a deploy shows `run_worker_first` routing, `request.cf`
// on the platform, and headers `public/_headers` cannot set on a script-built response.
//
// The runner's own location is whatever Cloudflare reads off it, so this asserts that the
// placeholder was REPLACED, not what with: a runner Cloudflare cannot place would fail here, and
// GitHub's runners sit in data centres it places.

describe('the visitor’s approximate location', () => {
  test.skipIf(skipWithoutPreview).each(['/loader.js', '/'])(
    '%s carries it, and is never stored',
    async (path) => {
      const res = await fetchPreview(path)
      const body = await res.text()

      // A missing file answers 200 as the SPA shell, so the type is asserted, not the status.
      expect(res.headers.get('content-type')).toMatch(path === '/' ? /html/ : /javascript/)
      expect(body).not.toContain(GEO_PLACEHOLDER)
      expect(res.headers.get('cache-control')).toMatch(/no-store/)
      expect(res.headers.get('access-control-allow-origin')).toBe('*')
    },
  )

  // The script runs only where `run_worker_first` names a path: `auto.js` stays revalidated.
  test.skipIf(skipWithoutPreview)('leaves every other file to the asset layer', async () => {
    const res = await fetchPreview('/auto.js')

    expect(res.headers.get('cache-control')).toMatch(/must-revalidate/)
    expect(res.headers.get('cache-control')).not.toMatch(/no-store/)
  })
})
