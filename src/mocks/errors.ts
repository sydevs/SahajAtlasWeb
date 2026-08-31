import type { ErrorKind } from '@/lib/report'

import { atlasError } from '@/lib/report'

// One representative throw per failure kind (issue #89) — the REAL values, so a story
// exercises `classifyError` rather than asserting a kind it was handed. Shared by the
// app-level (Fallbacks) and drawer (Views) error stories so the two enumerations can't
// drift, and by `report.test.ts`, which asserts every fixture classifies as its own key.
//
// Keyed by kind and typed `Record<ErrorKind, unknown>`, so adding a kind to the union
// fails the build here until it has a fixture and therefore a story.

/** A `PayloadSDKError` as a fallback sees it: an Error carrying an HTTP status. */
export const sdkError = (status: number, message = 'Request failed') =>
  Object.assign(new Error(message), { status })

export const mockErrors: Record<ErrorKind, unknown> = {
  // In the app this is a fetch TypeError ("Failed to fetch" — Chrome's wording; Firefox
  // and Safari differ) raised while `navigator.onLine` is false. Tagged here rather than
  // thrown raw so the story doesn't classify differently depending on whether the machine
  // rendering it happens to be online: an ambiguous network failure is `server`, and only
  // the browser's own verdict makes it `offline`. That pairing is covered in report.test.
  offline: atlasError('offline', 'Failed to fetch'),
  // The undefined-body path `validateSDKResponse` guards (payloadcms/payload#14495).
  server: atlasError('server', 'SahajCloud request returned no data: /events/geojson'),
  // A hand-typed or dead region URL.
  'not-found': atlasError('not-found', 'Region not found: atlantis'),
  // An embed whose API key SahajCloud rejects.
  config: sdkError(401, 'Unauthorized'),
  // A host page whose CSP refuses challenges.cloudflare.com, so no form in the widget can
  // produce a token (issue #182). Tagged rather than script-driven for the same reason
  // `offline` is: the fixture must classify the same way wherever the story renders.
  'captcha-blocked': atlasError('captcha-blocked', 'Turnstile could not be loaded'),
  // Anything unrecognized — the catch-all that offers both a retry and a report. A zod
  // parse failure lands here too, which is why the fixture IS one: `contract` used to be
  // its own kind, and collapsing it means the shape that once had a bespoke row must go
  // on classifying (and rendering) as the catch-all.
  unknown: Object.assign(new Error('Invalid input'), {
    name: 'ZodError',
    issues: [{ code: 'invalid_type', expected: 'number', path: ['events', 0, 'id'] }],
  }),
}

export const mockErrorKinds = Object.keys(mockErrors) as ErrorKind[]

/**
 * A not-found fixture per ENTITY, so a view story reproduces the failure it actually
 * reaches rather than a generic stand-in. `mockErrors['not-found']` is region-flavoured,
 * which is wrong for the views whose dead link is an event.
 *
 * Per entity, not per throw site. `views/shared.tsx` also throws not-found from
 * `useEventFromPath` when a hand-typed `/register` sits over a region rather than an
 * event — but that reaches the boundary as the same kind, at the same path, and renders
 * the same screen, so a story option for it showed nothing a reviewer could tell apart.
 * The two code paths through `classifyError` (our own tag vs. an HTTP status) are what
 * differ, and `report.test.ts` covers both directly.
 */
export const mockNotFound = {
  /** `fetch.ts` — a slug the region tree doesn't carry. RegionView, OnlineView. */
  region: atlasError('not-found', 'Region not found: atlantis'),
  /** SahajCloud answers 404 and `classifyError` reads the status — the only not-found
   *  fixture exercising the status path rather than our own tag. EventView,
   *  RegistrationView, ShareView. */
  event: sdkError(404, 'Not Found'),
}

/**
 * What each case is meant to PROVE, so a reviewer compares the buttons rather than the
 * sentence. Lives beside the fixtures so the app-level story renders them and the drawer's
 * can point readers here, rather than wording the same rationale twice.
 */
export const mockErrorNotes: Record<ErrorKind, string> = {
  offline:
    'A failed fetch. Try again only — connectivity is not ours to fix, and the report POST needs the very network that just failed.',
  server: 'A 5xx, or an empty body. Try again, with the report CTA beneath it.',
  'not-found':
    "A dead link — the empty state's register, not a malfunction. In the drawer it offers the recovery ladder plus a field; at the app level, where no drawer stack is mounted for either to lead anywhere, `visibleActions` restores the report CTA in their place.",
  config: 'A rejected API key. Report only; nothing a viewer can press will help.',
  'captcha-blocked':
    "A host CSP that blocks Turnstile. The only row offering NOTHING at all — not even a report, because the report form is captcha-gated too, so it would be a second form that can't submit. The fix belongs to the site's developer, who gets it on the console.",
  unknown:
    "Unrecognized — including a zod parse failure, where SahajCloud's shape drifted from ours. Both a retry and a report: the cause is for the report, not the screen.",
}
