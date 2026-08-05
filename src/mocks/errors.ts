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
  // SahajCloud's shape drifted from the zod schema parsing it.
  contract: Object.assign(new Error('Invalid input'), {
    name: 'ZodError',
    issues: [{ code: 'invalid_type', expected: 'number', path: ['events', 0, 'id'] }],
  }),
  // Anything unrecognized — the catch-all that still offers both a retry and a report.
  unknown: new Error('Something unexpected happened'),
}

export const mockErrorKinds = Object.keys(mockErrors) as ErrorKind[]

/**
 * What each case is meant to PROVE, so a reviewer compares the buttons rather than the
 * sentence. Lives beside the fixtures so the two stories that render them share one
 * description apiece instead of wording the same rationale twice.
 */
export const mockErrorNotes: Record<ErrorKind, string> = {
  offline:
    'A failed fetch. Try again only — connectivity is not ours to fix, and the report POST needs the very network that just failed.',
  server: 'A 5xx, or an empty body. Try again, with the report CTA beneath it.',
  'not-found': 'A dead link. See nearby events only — retrying fails identically.',
  config: 'A rejected API key. Report only; nothing a viewer can press will help.',
  contract: "SahajCloud's shape drifted from ours. Report only.",
  unknown: 'Unrecognized. The catch-all still offers both a retry and a report.',
}
