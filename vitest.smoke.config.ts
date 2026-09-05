import { defineConfig } from 'vitest/config'

// Smoke specs run against a deployed Cloudflare Pages preview
// (PREVIEW_URL). They do not run against the local build. They use fetch
// calls, not a browser. This config is separate, so the fast local unit
// lane never runs these specs.
export default defineConfig({
  test: {
    include: ['tests/smoke/**/*.smoke.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // These specs send network requests to a real edge deployment. Give
    // them extra time. Retry a failed request instead of failing the
    // job.
    retry: 2,
    bail: 0,
  },
})
