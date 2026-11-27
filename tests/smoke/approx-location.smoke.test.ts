import { describe, expect, test } from 'vitest'

import { fetchPreview, skipWithoutPreview } from './_helpers/preview'

// Does the deployed app Worker serve `/geo.js`, the visitor's approximate location, as a module a
// host page can import? A deploy-time fact: the unit lane holds the Worker's code, but only a
// deploy shows `run_worker_first` routing, `request.cf` on the platform, and the headers
// `public/_headers` cannot set on a script-built response.
//
// The runner's own location is whatever Cloudflare reads off it, so this asserts the module's
// shape, not where it places the runner.

describe('the visitor’s approximate location', () => {
  test.skipIf(skipWithoutPreview)(
    '/geo.js is a module, importable cross-origin, never stored',
    async () => {
      const res = await fetchPreview('/geo.js')

      // A missing file answers 200 as the SPA shell, so the type is asserted, not the status.
      expect(res.headers.get('content-type')).toMatch(/javascript/)
      expect(await res.text()).toMatch(/^export default (null|\{.*\})\n$/)
      expect(res.headers.get('cache-control')).toMatch(/no-store/)
      expect(res.headers.get('access-control-allow-origin')).toBe('*')
    },
  )
})
