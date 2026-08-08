import type { ContactAdminErrorCode, ContactAdminRequest } from '@/types/payload/contact-types'
import type { EventRegistrationErrorCode } from '@/types/payload/response-types'
import type { ReportPayload } from '@/lib/report'
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

/**
 * Re-cast a thrown SDK error as the caller's own refusal class when the body carries a
 * `code`; any other failure (network, 404, validation) passes through untouched.
 *
 * One helper for both mutations, because every coded refusal SahajCloud sends has this
 * same body shape — the alternative is each endpoint growing its own near-copy, and the
 * next one inheriting whichever spelling it happened to land beside.
 */
const asRefusal = <Code extends string>(
  error: unknown,
  refused: (code: Code, message: string) => Error,
  fallbackMessage: string,
): unknown => {
  const parsed = RefusalBodySchema.safeParse(error)
  const refusal = parsed.success ? parsed.data.errors.find((entry) => entry.code) : undefined

  if (!refusal?.code) return error

  return refused(
    refusal.code as Code,
    refusal.message ?? (error instanceof Error ? error.message : fallbackMessage),
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
    throw asRefusal<EventRegistrationErrorCode>(
      error,
      (code, message) => new RegistrationRefusedError(code, message),
      'Registration refused',
    )
  }
}

// Confirmation returned by `POST /api/contact-admin` (ContactAdminResponse). Nothing is
// persisted server-side — the email IS the deliverable, so `ok` is the whole receipt.
const ContactResponseSchema = z.object({ ok: z.literal(true) })

export type ContactResponse = z.infer<typeof ContactResponseSchema>

/**
 * A contact message SahajCloud refused for a reason it named. Today the endpoint defines
 * exactly one code — `captcha_failed`: the Turnstile token was forged, expired, or (since
 * tokens are single-use) already redeemed. It arrives as a 403, and the caller is meant
 * to reset its captcha widget so the sender can retry in place.
 *
 * Typed as the synced contract union rather than a local string union, so a
 * `pnpm types:cms` that renames or adds a code fails the build at the consumer instead of
 * silently degrading to the generic error.
 */
export class ContactRefusedError extends Error {
  readonly code: ContactAdminErrorCode

  constructor(code: ContactAdminErrorCode, message: string) {
    super(message)
    this.name = 'ContactRefusedError'
    this.code = code
  }
}

/** The caller's label for this channel, which becomes the email's subject line. */
const REPORT_SUBJECT = 'Issue report'

/**
 * Trim a context value to the endpoint's own bound for that field.
 *
 * Every `context` string is bounded server-side, and an over-long one is a **400 for the
 * whole message**. `path` and `locale` we build ourselves and are belt-and-braces; the
 * two that matter are foreign input — `userAgent` (bound 500) and `error` (2000, the
 * thrown message). Losing a bug report to a long browser string would be the worst
 * possible trade, and a truncated user agent still identifies the browser.
 */
const clamp = (value: string, max: number) => value.slice(0, max)

/**
 * Send a viewer's issue report to `POST /api/contact-admin` (sydevs/SahajCloud#602,
 * issues #80/#103) — a shared, general-purpose channel that Turnstile-verifies the token
 * server-side, then emails `contact@sydevelopers.com` with the sender's address as
 * `Reply-To`. This caller supplies the Atlas framing (the subject); the endpoint itself
 * carries none.
 *
 * The email is the deliverable, so the endpoint answers 502 rather than a false 200 when
 * the send fails — every non-2xx therefore reaches the caller as a throw, and the form
 * must never show its "sent" screen off anything but a resolved promise.
 */
const contactAdmin = async (payload: ReportPayload): Promise<ContactResponse> => {
  const { context } = payload

  const json: ContactAdminRequest = {
    message: payload.message,
    // A blank optional input registers as '' — omit it rather than sending an empty
    // Reply-To (the endpoint validates `.email()` on anything present).
    ...(payload.email ? { email: payload.email } : {}),
    subject: REPORT_SUBJECT,
    turnstileToken: payload.turnstileToken,
    context: {
      path: clamp(context.path, 500),
      // Our field is `pageUrl`; the endpoint's is `hostUrl`. Same value — the host page
      // as origin + path, already stripped of its query and fragment by
      // `buildReportContext`, since a host's own URL can carry a reset token.
      hostUrl: clamp(context.pageUrl, 500),
      locale: clamp(context.locale, 20),
      userAgent: clamp(context.userAgent, 500),
      // Already capped at 500 by `buildReportContext`; the endpoint allows 2000.
      ...(context.error ? { error: clamp(context.error, 2000) } : {}),
    },
    // `context.client` is deliberately NOT sent: the endpoint derives the service name
    // from the authenticated API key, so passing our cached copy would be a second,
    // forgeable source for the same row (and the schema would strip it anyway).
  }

  try {
    const response = await requestJson({ method: 'POST', path: '/contact-admin', json })

    return ContactResponseSchema.parse(response)
  } catch (error) {
    throw asRefusal<ContactAdminErrorCode>(
      error,
      (code, message) => new ContactRefusedError(code, message),
      'Message refused',
    )
  }
}

export default {
  createRegistration,
  contactAdmin,
}
