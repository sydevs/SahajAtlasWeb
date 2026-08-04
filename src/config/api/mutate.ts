import type { EventRegistrationErrorCode } from '@/types/payload/response-types'
import type { Registration } from '@/types'

import z from 'zod'

import { activeLocale, requestJson } from './client'

// Confirmation returned by `POST /api/events/:id/register` (EventRegistrationResponse).
const RegistrationResponseSchema = z.object({
  ok: z.literal(true),
  registration: z.object({ id: z.number(), uuid: z.string() }),
})

export type RegistrationResponse = z.infer<typeof RegistrationResponseSchema>

/**
 * A registration the server refused for a *state* reason — the event is closed
 * to registration even though the client could read it (external mode / ended /
 * a started course / full). SahajCloud answers those with `409` plus a stable
 * machine-readable `code` (SahajCloud#601), so the widget can render its own
 * localized copy instead of the endpoint's English prose.
 *
 * `code` is deliberately typed as the synced contract union but NOT validated
 * here: a code this build doesn't know about is a copy problem, not a data
 * problem, and the form falls back to the generic error message for it.
 */
export class RegistrationRefusedError extends Error {
  readonly code: EventRegistrationErrorCode

  constructor(code: EventRegistrationErrorCode, message: string) {
    super(message)
    this.name = 'RegistrationRefusedError'
    this.code = code
  }
}

// The SDK throws a PayloadSDKError carrying the response body's `errors` array
// verbatim, so a refusal's `code` rides through untouched. Duck-typed rather than
// `instanceof PayloadSDKError` so the shape check, not the class identity, is what
// this depends on.
const RefusalBodySchema = z.object({
  errors: z
    .array(z.object({ message: z.string().optional(), code: z.string().optional() }))
    .nonempty(),
})

/** Re-cast a thrown SDK error as a `RegistrationRefusedError` when it carries a
 *  refusal code; any other failure (network, 404, validation) passes through. */
const asRefusal = (error: unknown): unknown => {
  const parsed = RefusalBodySchema.safeParse(error)
  const refusal = parsed.success ? parsed.data.errors.find((entry) => entry.code) : undefined

  if (!refusal?.code) return error

  return new RegistrationRefusedError(
    refusal.code as EventRegistrationErrorCode,
    refusal.message ?? (error instanceof Error ? error.message : 'Registration refused'),
  )
}

const createRegistration = async (
  eventId: number,
  data: Registration,
): Promise<RegistrationResponse> => {
  try {
    // A custom (non-CRUD) endpoint → the SDK's raw `request` helper. `request` throws a
    // PayloadSDKError on a non-2xx, so a failed registration still rejects to the caller.
    const response = await requestJson({
      method: 'POST',
      path: `/events/${eventId}/register`,
      json: {
        email: data.email,
        name: data.name,
        startingAt: data.startingAt.toISOString(),
        questions: data.questions,
        // The registrant's language, so SahajCloud sends the confirmation email
        // (and its reminders) in the language they registered in — the endpoint
        // otherwise falls back to its own default, i.e. English for everyone.
        // The same resolved language the request's `locale` param carries, so
        // there's one definition of "what language is this". SahajCloud REJECTS
        // an unknown code rather than defaulting, so this must stay a subset of
        // its LOCALES (all ten widget languages are in it since SahajCloud#578).
        locale: activeLocale(),
      },
    })

    return RegistrationResponseSchema.parse(response)
  } catch (error) {
    throw asRefusal(error)
  }
}

export default {
  createRegistration,
}
