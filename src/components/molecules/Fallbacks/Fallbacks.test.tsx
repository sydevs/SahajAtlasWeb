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
    // that just failed.
    expect(ERROR_POLICY.offline).toMatchObject({ retry: true, report: false })
  })

  it('offers none of these buttons for a dead link', () => {
    // Retrying a region that doesn't exist fails identically, every time — and a dead
    // link's actual recovery is the drawer's dead-end body (somewhere real to go, from
    // `useRecoveryOffer`), not a button here. `visibleActions` covers the app-level
    // surface, where that body isn't rendered.
    expect(ERROR_POLICY['not-found']).toMatchObject({ retry: false, report: false })
  })

  it('offers only a report where nothing a viewer can press would help', () => {
    expect(ERROR_POLICY.config).toMatchObject({ retry: false, report: true })
    expect(ERROR_POLICY.contract).toMatchObject({ retry: false, report: true })
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
})

describe('visibleActions', () => {
  it('never leaves a viewer with no way out, with or without a reset', () => {
    // The case this guards: `not-found` grants none of these buttons, because its real
    // recovery is the drawer's dead-end body. On the app-level surface that body isn't
    // rendered, so without the restore rule the screen would have zero buttons.
    for (const kind of mockErrorKinds) {
      for (const canRetry of [true, false]) {
        const { retry, report } = visibleActions(ERROR_POLICY[kind], { canRetry })

        expect(retry || report).toBe(true)
      }
    }
  })

  it('restores the report CTA for a dead link where nothing else is offered', () => {
    expect(visibleActions(ERROR_POLICY['not-found'], { canRetry: true })).toMatchObject({
      retry: false,
      report: true,
    })
  })

  it('keeps offline free of the report CTA while the retry is on offer', () => {
    // The report POST needs the very network that just failed.
    expect(visibleActions(ERROR_POLICY.offline, { canRetry: true })).toMatchObject({
      retry: true,
      report: false,
    })
  })

  it('restores it when there is no reset to offer', () => {
    expect(visibleActions(ERROR_POLICY.offline, { canRetry: false })).toMatchObject({
      retry: false,
      report: true,
    })
  })

  it('has a policy for whatever any fixture classifies as', () => {
    // Belt-and-braces on the Record's exhaustiveness: a kind reachable at runtime with
    // no policy entry would render a fallback with no buttons and an undefined key.
    for (const kind of mockErrorKinds) {
      expect(ERROR_POLICY[classifyError(mockErrors[kind])]).toBeDefined()
    }
  })
})
