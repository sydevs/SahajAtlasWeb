import { defineConfig, devices } from '@playwright/test'

import { LANE_DIST, LANE_PORT } from './tests/browser/lane.mjs'
import { WIRE_API_KEY } from './src/mocks/wire'

// The browser lane: the built widget, on real host pages, in a real Chromium, with every
// request answered from fixtures (`tests/browser/fixtures.ts`). `docs/testing.md` § "The
// browser lane" says why it is hermetic and how to run and debug it.
const CI = Boolean(process.env.CI)

export default defineConfig({
  testDir: 'tests/browser',
  testMatch: '**/*.spec.ts',
  outputDir: 'test-results/browser',
  forbidOnly: CI,
  // ⚠ **No retries, here or in CI.** A retry turns a flaky scenario green, and a lane that
  // blocks merges must fail on the first flake so somebody fixes it.
  retries: 0,
  reporter: CI
    ? [['list'], ['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${LANE_PORT}`,
    // Traces cost seconds per test; CI keeps the failures' for the uploaded report.
    trace: CI ? 'retain-on-failure' : 'off',
    // The full Chromium in its new headless mode, not the headless shell, so a local run and CI
    // render through the same browser.
    channel: 'chromium',
    launchOptions: {
      // For a machine whose Chromium is not the one this Playwright pins, such as a sandbox with
      // its own browsers preinstalled. Unset, Playwright launches the browser it installed.
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: [
        // ⚠ **The map needs WebGL, and a runner has no GPU.** SwiftShader is Chromium's software
        // renderer, reached through ANGLE, and the first switch makes it the renderer on every
        // machine, so a laptop with a GPU draws the map the way CI does. WebGL's silent fallback
        // to it is deprecated (issues.chromium.org/40277080), so the second opts in by name,
        // although Playwright adds it today. Both: `docs/gpu/swiftshader.md` in Chromium.
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        // Nothing resolves but the review server. Routing already answers or aborts every
        // other request; this makes one that slipped past it fail to connect instead of
        // reaching a real host.
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost',
      ],
    },
  },
  webServer: {
    // The same server as `pnpm review:embed`, over the lane's own build and key.
    command: `node scripts/serve-embed-review.mjs --dist ${LANE_DIST} --port ${LANE_PORT} --key ${WIRE_API_KEY}`,
    url: `http://localhost:${LANE_PORT}/`,
    // ⚠ Never reuse: a server already on the port may be serving another build (trap 4 in the
    // server's own header), and every scenario would then read the wrong document.
    reuseExistingServer: false,
  },
})
