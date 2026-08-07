import type { FallbackPolicy } from './Fallbacks'

import { describe, expect, it } from 'vitest'

import enCommon from '../../../../public/locales/en/common.json'

import { ERROR_POLICY, visibleActions } from './Fallbacks'

import { classifyError } from '@/lib/report'
import { mockErrorKinds, mockErrors } from '@/mocks/errors'

/** A row with its sentence stripped off — everything two rows are allowed to share. */
const waysOut = (policy: FallbackPolicy) => ({
  color: policy.color,
  retry: policy.retry,
  onward: policy.onward,
  search: policy.search,
  clearFilters: policy.clearFilters,
  contact: policy.contact,
  report: policy.report,
})

/** `filters.no_events` → the shipped English, or undefined if the key is dead. */
const enCopy = (dottedKey: string): unknown =>
  dottedKey
    .split('.')
    .reduce<unknown>(
      (node, key) => (node && typeof node === 'object' ? (node as never)[key] : undefined),
      enCommon,
    )

// The acceptance criteria of issue #89, as assertions: each state offers ONLY the actions
// that could help. `classifyError` (src/lib/report.test.ts) decides which kind a *failure*
// is; this decides what any kind — failure or empty list — is then allowed to render.
describe('ERROR_POLICY', () => {
  it('offers a retry but never a report for offline', () => {
    // Connectivity isn't ours to fix, and the report POST (#80) needs the very network
    // that just failed.
    expect(ERROR_POLICY.offline).toMatchObject({ retry: true, report: false })
  })

  it('offers none of the failure buttons for a dead link', () => {
    // Retrying a region that doesn't exist fails identically, every time — and a dead
    // link's actual recovery is somewhere to go, not a button that repeats the failure.
    expect(ERROR_POLICY['not-found']).toMatchObject({ retry: false, report: false, onward: true })
  })

  it('offers only a report where nothing a viewer can press would help', () => {
    expect(ERROR_POLICY.config).toMatchObject({ retry: false, report: true })
  })

  it('keeps a retry and a report for the ones that might be transient', () => {
    expect(ERROR_POLICY.server).toMatchObject({ retry: true, report: true })
    expect(ERROR_POLICY.unknown).toMatchObject({ retry: true, report: true })
  })

  it('gives a dead link and an empty list the same way out', () => {
    // The whole argument for one table: a URL that never existed and a region whose
    // programs have all ended leave a viewer in exactly the same position, so the rows may
    // differ ONLY in their sentence. If these ever diverge, one of the two has quietly
    // become the worse dead end.
    expect(waysOut(ERROR_POLICY.empty)).toEqual(waysOut(ERROR_POLICY['not-found']))
    expect(waysOut(ERROR_POLICY['not-found-event'])).toEqual(waysOut(ERROR_POLICY['not-found']))
  })

  it('offers a person, not a button, when a class cannot be joined', () => {
    // The one row whose best next step is somebody who can still let you in. Retrying and
    // reporting are both wrong for it: the class is running, it just has no room.
    expect(ERROR_POLICY.unavailable).toMatchObject({
      contact: true,
      onward: true,
      retry: false,
      report: false,
    })
  })

  it('marks a malfunction red and a dead end neutral', () => {
    // A red banner over "no events found" would tell a viewer the widget is broken when
    // nothing is. Register drift is invisible in review, so it's pinned here.
    for (const kind of ['offline', 'server', 'config', 'unknown'] as const) {
      expect(ERROR_POLICY[kind].color).toBe('danger')
    }
    for (const kind of [
      'not-found',
      'empty',
      'no-results',
      'no-nearby',
      'country-site',
      'unavailable',
    ] as const) {
      expect(ERROR_POLICY[kind].color).toBe('neutral')
    }
  })

  it('never offers a network-dependent way out of a network failure', () => {
    // Both the onward link and the geocoder need the connection that just went away, so
    // offering either would only reproduce the failure one press later.
    expect(ERROR_POLICY.offline).toMatchObject({ onward: false, search: false })
  })

  it('shows localized copy for every state, never the thrown developer string', () => {
    for (const policy of Object.values(ERROR_POLICY)) {
      expect(enCopy(policy.messageKey)).toBeTypeOf('string')
    }
  })

  it('carries English for every state, for a failure that beat the locale JSON', () => {
    // Nothing is bundled — i18next fetches every namespace over HTTP — so without a
    // default the very screens this exists for would render the raw key.
    for (const policy of Object.values(ERROR_POLICY)) {
      expect(policy.fallbackText).toMatch(/[a-z]/)
      expect(policy.fallbackText).not.toMatch(/^(error|filters|country_site)\./)
    }
  })

  it('keeps every fallbackText word-for-word identical to the shipped en copy', () => {
    // These are two hand-maintained copies of the same sentence, and they already drifted
    // once: the locale files were reworded ("that page" → "what you were looking for")
    // while the defaults kept the old wording. Nobody would have noticed — the default
    // only renders when the locale fetch loses a race — so a viewer on a broken
    // connection would have read different words than everyone else.
    for (const policy of Object.values(ERROR_POLICY)) {
      expect(policy.fallbackText).toBe(enCopy(policy.messageKey))
    }
  })
})

describe('visibleActions', () => {
  it('never leaves a viewer with no way out, with or without a reset', () => {
    // The case this guards: `not-found` grants none of the failure buttons, because its
    // real recovery is somewhere to go. On the app-level surface the drawer stack was
    // never mounted, so navigating leads nowhere and the screen would have zero controls.
    for (const kind of mockErrorKinds) {
      for (const canRetry of [true, false]) {
        for (const canNavigate of [true, false]) {
          const actions = visibleActions(ERROR_POLICY[kind], { canRetry, canNavigate })

          expect(Object.values(actions).some(Boolean)).toBe(true)
        }
      }
    }
  })

  it('restores the report CTA for a dead link where nothing else is offered', () => {
    expect(
      visibleActions(ERROR_POLICY['not-found'], { canRetry: true, canNavigate: false }),
    ).toMatchObject({ retry: false, onward: false, search: false, report: true })
  })

  it('leaves a dead link alone while it has somewhere to send you', () => {
    expect(visibleActions(ERROR_POLICY['not-found'], { canRetry: true })).toMatchObject({
      onward: true,
      search: true,
      report: false,
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

  it('leaves a state that promised nothing with nothing', () => {
    // `no-nearby` is a note about the list directly below it, whose own "Show distant
    // events" control IS the way out. Bolting a report CTA onto it — which the
    // never-strand rule would do if it fired on emptiness rather than on a broken promise
    // — would invite reports of a feature working exactly as designed.
    const actions = visibleActions(ERROR_POLICY['no-nearby'], { canRetry: true })

    expect(Object.values(actions).some(Boolean)).toBe(false)
  })

  it('drops the geocoder where the surface already leads with one', () => {
    // SearchView's header IS a geocoder; a second under the sentence is the odd thing on
    // the screen. The onward rung survives, so this can't strand anyone.
    expect(
      visibleActions(ERROR_POLICY.empty, { canRetry: false, hasSearchChrome: true }),
    ).toMatchObject({ search: false, onward: true, report: false })
  })

  it('leads with the organiser and drops the onward rung when there is one to call', () => {
    // Not both: "see events nearby" beside a number that can still get you into THIS class
    // offers a consolation prize as an equal.
    expect(
      visibleActions(ERROR_POLICY.unavailable, { canRetry: false, canContact: true }),
    ).toMatchObject({ contact: true, onward: false, report: false })
  })

  it('falls back to the onward rung when the event carries no contact', () => {
    expect(
      visibleActions(ERROR_POLICY.unavailable, { canRetry: false, canContact: false }),
    ).toMatchObject({ contact: false, onward: true, report: false })
  })

  it('drops the clear-filters CTA when no filter set was handed in', () => {
    expect(
      visibleActions(ERROR_POLICY['no-results'], { canRetry: false, canClearFilters: false }),
    ).toMatchObject({ clearFilters: false, report: true })
  })

  it('has a policy for whatever any fixture classifies as', () => {
    // Belt-and-braces on the Record's exhaustiveness: a kind reachable at runtime with
    // no policy entry would render a fallback with no buttons and an undefined key.
    for (const kind of mockErrorKinds) {
      expect(ERROR_POLICY[classifyError(mockErrors[kind])]).toBeDefined()
    }
  })
})
