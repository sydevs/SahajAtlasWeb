import type { ErrorKind } from '@/lib/report'

// One representative throw per failure kind (issue #89) — the REAL values, so a story
// exercises `classifyError` rather than asserting a kind it was handed. Shared by the
// app-level (Fallbacks) and drawer (Views) error stories so the two enumerations can't
// drift, and by the view stories that expose their own reachable failure.
//
// Keyed by kind and typed `Record<ErrorKind, unknown>`, so adding a kind to the union
// fails the build here until it has a fixture and therefore a story.

/** A `PayloadSDKError` as a fallback sees it: an Error carrying an HTTP status. */
const sdkError = (status: number, message: string) => Object.assign(new Error(message), { status })

export const mockErrors: Record<ErrorKind, unknown> = {
  // Native fetch's rejection — the wording is Chrome's; Firefox and Safari differ.
  offline: new TypeError('Failed to fetch'),
  // The undefined-body path `validateSDKResponse` guards (payloadcms/payload#14495).
  server: new Error('SahajCloud request returned no data: /events/geojson'),
  // A hand-typed or dead region URL.
  'not-found': new Error('Region not found: atlantis'),
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
