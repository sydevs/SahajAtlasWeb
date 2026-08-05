import { describe, expect, it } from 'vitest'

import { ERROR_POLICY } from './Fallbacks'

import { classifyError } from '@/lib/report'
import { mockErrorKinds, mockErrors } from '@/mocks/errors'

// The acceptance criteria of issue #89, as assertions: each kind offers ONLY the actions
// that could help. `classifyError` (src/lib/report.test.ts) decides which kind a failure
// is; this decides what that kind is then allowed to render.
describe('ERROR_POLICY', () => {
  it('offers a retry but never a report for offline', () => {
    // Connectivity isn't ours to fix, and the report POST (#80) needs the very network
    // that just failed. No nearby search either — it would fail identically.
    expect(ERROR_POLICY.offline).toMatchObject({ retry: true, nearby: false, report: false })
  })

  it('offers only a way back into live inventory for a dead link', () => {
    // Retrying a region that doesn't exist fails identically, every time.
    expect(ERROR_POLICY['not-found']).toMatchObject({ retry: false, nearby: true, report: false })
  })

  it('offers only a report where nothing a viewer can press would help', () => {
    expect(ERROR_POLICY.config).toMatchObject({ retry: false, nearby: false, report: true })
    expect(ERROR_POLICY.contract).toMatchObject({ retry: false, nearby: false, report: true })
  })

  it('keeps a retry and a report for the ones that might be transient', () => {
    expect(ERROR_POLICY.server).toMatchObject({ retry: true, report: true })
    expect(ERROR_POLICY.unknown).toMatchObject({ retry: true, report: true })
  })

  it('shows localized copy for every kind, never the thrown developer string', () => {
    for (const policy of Object.values(ERROR_POLICY)) {
      expect(policy.messageKey).toMatch(/^error\./)
    }
  })

  it('offers at least one action for every kind — no dead end', () => {
    for (const kind of mockErrorKinds) {
      const { retry, nearby, report } = ERROR_POLICY[kind]

      expect(retry || nearby || report).toBe(true)
    }
  })

  it('has a policy for whatever any fixture classifies as', () => {
    // Belt-and-braces on the Record's exhaustiveness: a kind reachable at runtime with
    // no policy entry would render a fallback with no buttons and an undefined key.
    for (const kind of mockErrorKinds) {
      expect(ERROR_POLICY[classifyError(mockErrors[kind])]).toBeDefined()
    }
  })
})
