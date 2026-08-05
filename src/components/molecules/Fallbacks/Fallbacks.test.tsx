import { describe, expect, it } from 'vitest'

import { ERROR_POLICY, visibleActions } from './Fallbacks'

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

  it('carries English for every kind, for a failure that beat the locale JSON', () => {
    // Nothing is bundled — i18next fetches every namespace over HTTP — so without a
    // default the very failures this screen exists for would render the raw key.
    for (const policy of Object.values(ERROR_POLICY)) {
      expect(policy.fallbackText).toMatch(/[a-z]/)
      expect(policy.fallbackText).not.toContain('error.')
    }
  })

  it('offers at least one action for every kind — no dead end', () => {
    for (const kind of mockErrorKinds) {
      const { retry, nearby, report } = ERROR_POLICY[kind]

      expect(retry || nearby || report).toBe(true)
    }
  })
})

describe('visibleActions', () => {
  const SURFACES = [
    // The drawer: a boundary to reset, and a mounted stack to navigate into.
    { canRetry: true, canNavigate: true },
    // The app-level screen: the drawer stack isn't mounted, so a search goes nowhere.
    { canRetry: true, canNavigate: false },
    // Defensive: a caller that renders a fallback with no reset to offer.
    { canRetry: false, canNavigate: true },
    { canRetry: false, canNavigate: false },
  ]

  it('never leaves a viewer with no way out, on any surface', () => {
    // The narrowing that produced the bug this guards: `not-found` is nearby-only, and
    // the app-level surface can't navigate — which would have rendered zero buttons.
    for (const kind of mockErrorKinds) {
      for (const surface of SURFACES) {
        const { retry, nearby, report } = visibleActions(ERROR_POLICY[kind], surface)

        expect(retry || nearby || report).toBe(true)
      }
    }
  })

  it('does not offer a search the app-level screen cannot reach', () => {
    // That boundary has no `resetKeys`, so navigating would change the URL and leave the
    // same error screen on top of it. The report CTA takes the slot instead.
    const appLevel = visibleActions(ERROR_POLICY['not-found'], {
      canRetry: true,
      canNavigate: false,
    })

    expect(appLevel).toMatchObject({ nearby: false, report: true })
  })

  it('keeps offline free of the report CTA wherever something else is on offer', () => {
    expect(
      visibleActions(ERROR_POLICY.offline, { canRetry: true, canNavigate: false }),
    ).toMatchObject({ retry: true, report: false })
  })

  it('has a policy for whatever any fixture classifies as', () => {
    // Belt-and-braces on the Record's exhaustiveness: a kind reachable at runtime with
    // no policy entry would render a fallback with no buttons and an undefined key.
    for (const kind of mockErrorKinds) {
      expect(ERROR_POLICY[classifyError(mockErrors[kind])]).toBeDefined()
    }
  })
})
