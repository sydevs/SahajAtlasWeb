// What the credentialed build sends to Sentry besides the maps (#130). `telemetry: false` in
// `vite.config.ts` reaches only the plugin: the `sentry` CLI it runs in-process takes its own
// switch from the environment, so this evaluates the config the way the deploy build does.

import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
})

it('switches off the Sentry CLI’s own telemetry on the build that uploads', async () => {
  vi.stubEnv('SENTRY_AUTH_TOKEN', 'spec-not-a-secret')
  vi.stubEnv('SENTRY_ORG', 'spec')
  vi.stubEnv('SENTRY_PROJECT', 'spec')
  vi.stubEnv('SENTRY_URL', 'http://127.0.0.1:1/')
  vi.stubEnv('SENTRY_CLI_NO_TELEMETRY', undefined)

  const { default: config } = await import('../vite.config')

  config({ command: 'build', mode: 'production' })

  expect(process.env.SENTRY_CLI_NO_TELEMETRY).toBe('1')
})
