import type { EventRegistrationErrorCode } from '@/types/payload/response-types'
import type { EmbedFingerprint } from '@/loader/detect'
import type { MountParts } from '@/lib/mount'
import type { ReportPayload } from '@/lib/report'
import type { Registration } from '@/types'

import z from 'zod'

import { activeLocale, requestJson } from './client'

// The confirmation returned by `POST /api/events/:id/register` (EventRegistrationResponse).
const RegistrationResponseSchema = z.object({
  ok: z.literal(true),
  registration: z.object({ id: z.number(), uuid: z.string() }),
})

export type RegistrationResponse = z.infer<typeof RegistrationResponseSchema>

/**
 * The codes a registration write can be refused with.
 *
 * A registration can be refused for a *state* reason: the event is closed to
 * registration even though the client could read it (external mode, ended, a
 * started course, or full). SahajCloud answers those with `409` plus a stable,
 * machine-readable `code` (SahajCloud#601), so the widget can render its own
 * localized copy instead of the endpoint's English prose. `code` is typed as the
 * synced contract union, but deliberately NOT validated here: a code this build
 * does not know about is a copy problem, not a data problem, and the form falls
 * back to the generic error message for it.
 *
 * `captcha_failed` is deliberately NOT in the synced `EventRegistrationErrorCode`
 * union, and is added here instead, because the two come from different places: the
 * endpoint's own union describes the *state* refusals it raises itself, while
 * `captcha_failed` is thrown one layer above it by SahajCloud's write-guard plugin,
 * which gates every client-originated write the same way (sydevs/SahajCloud#629).
 *
 * ⚠ **It is also not in that union YET, and the ordering is the reason.** #629 is
 * blocked on this change landing — the widget has to send the header before the
 * server may start requiring it — so at the time of writing no SahajCloud build
 * emits this code, and a `pnpm types:cms` would not produce it. Widening it here,
 * rather than waiting, is what lets the client be ready first. If a later re-sync
 * folds `captcha_failed` into the synced union, this extra member becomes redundant
 * and can go. Nothing breaks either way.
 */
export type RegistrationErrorCode = EventRegistrationErrorCode | 'captcha_failed'

export class RegistrationRefusedError extends Error {
  readonly code: RegistrationErrorCode

  constructor(code: RegistrationErrorCode, message: string) {
    super(message)
    this.name = 'RegistrationRefusedError'
    this.code = code
  }
}

/**
 * The SDK throws a PayloadSDKError carrying the response body's `errors` array
 * verbatim, so a refusal's `code` rides through untouched. This is duck-typed, rather
 * than `instanceof PayloadSDKError`, so the shape check, not the class identity, is
 * what this depends on.
 *
 * ⚠ **The code sits in one of two places, and both are live.** SahajCloud's
 * collection-backed routes go through Payload's own `formatErrors`, which nests the
 * `APIError` payload under `data` — so `POST /user-messages` refuses with
 * `errors[].data.code`. `POST /events/{id}/register` is a hand-written endpoint that
 * still builds `{ errors: [{ message, code }] }` itself, with the code at the top
 * level.
 *
 * So this accepts **both** positions, rather than moving from one to the other.
 * Switching would silently stop recognising every registration refusal: they would
 * fall through `asRefusal` untouched, and the form would show its generic "try
 * again" sentence in place of the copy written for each case. This is pinned by a
 * regression test.
 */
const RefusalBodySchema = z.object({
  errors: z
    .array(
      z.object({
        message: z.string().optional(),
        code: z.string().optional(),
        data: z.object({ code: z.string().optional() }).optional(),
      }),
    )
    .nonempty(),
})

/** The code off one error entry, from whichever of the two positions carries it. */
const entryCode = (entry: { code?: string; data?: { code?: string } }) =>
  entry.code ?? entry.data?.code

/**
 * Re-casts a thrown SDK error as the caller's own refusal class, when the body
 * carries a `code`. Any other failure (network, 404, validation) passes through
 * untouched.
 *
 * This is one helper for both mutations, because every coded refusal SahajCloud
 * sends has this same body shape — the alternative is each endpoint growing its own
 * near-copy, and the next one inheriting whichever spelling it happened to land
 * beside.
 */
const asRefusal = <Code extends string>(
  error: unknown,
  refused: (code: Code, message: string) => Error,
  fallbackMessage: string,
): unknown => {
  const parsed = RefusalBodySchema.safeParse(error)
  const refusal = parsed.success ? parsed.data.errors.find(entryCode) : undefined
  const code = refusal && entryCode(refusal)

  if (!code) return error

  return refused(
    code as Code,
    refusal.message ?? (error instanceof Error ? error.message : fallbackMessage),
  )
}

/**
 * The header every client-originated write carries its solved Turnstile token in.
 *
 * This uses a header rather than a body field, with the same name on every
 * endpoint: the write-guard that reads it is a plugin sitting above the handlers, so
 * it cannot know one endpoint's body shape from another's. #171 moves the report
 * form onto the same header.
 */
export const TURNSTILE_HEADER = 'x-turnstile-token'

const createRegistration = async (
  eventId: number,
  data: Registration,
  turnstileToken: string,
): Promise<RegistrationResponse> => {
  // Only the REQUEST is guarded: a `.parse()` inside this try would hand
  // `asRefusal` a ZodError, whose `.errors` are `{ message, code }` — the very
  // shape a refusal body has — so schema drift would be re-cast as a server
  // refusal carrying a zod issue code.
  let response: unknown

  try {
    // A custom (non-CRUD) endpoint uses the SDK's raw `request` helper. `request`
    // throws a PayloadSDKError on a non-2xx, so a failed registration still
    // rejects to the caller.
    response = await requestJson({
      method: 'POST',
      path: `/events/${eventId}/register`,
      // `sdk.request` merges these over its `baseInit` headers, and
      // `interceptFetch` then adds auth and the locale on top — so the token
      // rides alongside them, rather than replacing anything (see
      // `applyRequestContext`).
      init: { headers: { [TURNSTILE_HEADER]: turnstileToken } },
      json: {
        email: data.email,
        name: data.name,
        startingAt: data.startingAt.toISOString(),
        questions: data.questions,
        // The registrant's language, so SahajCloud sends the confirmation
        // email (and its reminders) in the language they registered in — the
        // endpoint otherwise falls back to its own default, meaning English
        // for everyone. This is the same resolved language the request's
        // `locale` param carries, so there is one definition of "what
        // language is this". SahajCloud REJECTS an unknown code rather than
        // defaulting, so this must stay a subset of its LOCALES (all ten
        // widget languages are in it since SahajCloud#578).
        locale: activeLocale(),
      },
    })
  } catch (error) {
    throw asRefusal<RegistrationErrorCode>(
      error,
      (code, message) => new RegistrationRefusedError(code, message),
      'Registration refused',
    )
  }

  return RegistrationResponseSchema.parse(response)
}

/**
 * The confirmation returned by `POST /api/user-messages`: Payload's create
 * envelope, `201 { doc, message }`.
 *
 * **Only `doc.id` is pinned, deliberately**, exactly as for `reportEmbed`: nothing
 * here renders any of it, and pinning a field we never read would turn a harmless
 * CMS-side rename into a failed report for every sender. `id` is the one member
 * that cannot be renamed — it is Payload's primary key — and requiring it is what
 * distinguishes a real create from any other 2xx body.
 */
const UserMessageResponseSchema = z.object({ doc: z.object({ id: z.number() }) })

export type UserMessageResponse = z.infer<typeof UserMessageResponseSchema>

/**
 * The codes a `user-messages` create can be refused with.
 *
 * This mirrors `AntiSpamCode` in SahajCloud's `src/lib/antiSpam/antiSpamGuard.ts`,
 * which is the definition — every one of these is raised by the write-guard plugin
 * sitting above the collection, not by the collection itself. It is **not** synced
 * by `pnpm types:cms`: that covers `responseTypes.ts` and the generated `Config`,
 * and this union lives in neither, so it is restated here the way
 * `RegistrationErrorCode` restates `captcha_failed`.
 *
 * All five are reachable for this form. `invalid_email` is belt-and-braces — the
 * widget validates the address with zod before sending — but the guard checks
 * `senderEmail` itself, so it can still come back.
 */
export type UserMessageErrorCode =
  | 'captcha_failed'
  | 'captcha_unavailable'
  | 'invalid_email'
  | 'disposable_email'
  | 'urls_not_allowed'

/**
 * A message SahajCloud refused for a reason it named, so the caller can render its
 * own localized copy instead of the guard's English prose. This arrives as a 403
 * (`captcha_failed`), a 400 (the email and URL checks), or a 500
 * (`captcha_unavailable`), always with the code at `errors[].data.code` — see
 * `RefusalBodySchema`.
 */
export class UserMessageRefusedError extends Error {
  readonly code: UserMessageErrorCode

  constructor(code: UserMessageErrorCode, message: string) {
    super(message)
    this.name = 'UserMessageRefusedError'
    this.code = code
  }
}

/** The caller's label for this channel, which becomes the email's subject line. */
const REPORT_SUBJECT = 'Issue report'

/**
 * Trims a context value to the collection's own bound for that field.
 *
 * Every `context` string is bounded server-side, and an over-long one gets a
 * **400 for the whole message**. `path` and `locale` are built by this codebase and
 * are belt-and-braces. The one that matters is foreign input — `userAgent`. Losing
 * a bug report to a long browser string would be the worst possible trade, and a
 * truncated user agent still identifies the browser.
 *
 * The bound is 2000 on every key, from the `context` JSON schema in SahajCloud's
 * `src/collections/UserMessages/UserMessages.ts`. The deleted endpoint's bounds
 * were tighter and uneven (500 on `path`/`hostUrl`/`userAgent`, 20 on `locale`).
 * nothing relied on the difference, so this follows the collection, rather than
 * keeping a stricter local copy that would silently truncate what the server
 * accepts.
 */
const CONTEXT_MAX = 2000

const clamp = (value: string, max: number) => value.slice(0, max)

/**
 * Sends a viewer's issue report to `POST /api/user-messages` (sydevs/SahajCloud#632,
 * PR #653, issues #80/#103/#171): a shared, general-purpose intake that the
 * write-guard Turnstile-verifies and spam-screens synchronously, then a background
 * job screens deeply and delivers to `contact@sydevelopers.com`, with the sender's
 * address as `Reply-To`. This caller supplies the Atlas framing (the subject). The
 * collection carries none.
 *
 * ⚠ **A 201 means ACCEPTED, not delivered.** This replaced a root endpoint whose
 * email *was* the deliverable, and which answered 502 rather than a false 200 when
 * the send failed. Delivery now happens minutes later in a job, so a failed send
 * reaches SahajCloud admins as a `failed` row and can no longer reach the sender at
 * all. The form's success copy therefore promises receipt, not delivery — see
 * `report.sent`.
 *
 * It is still true that the form must never show its "sent" screen off anything but
 * a resolved promise: every non-2xx reaches the caller as a throw.
 */
const sendUserMessage = async (payload: ReportPayload): Promise<UserMessageResponse> => {
  const { context } = payload

  const json = {
    message: payload.message,
    // A blank optional input registers as '' — this omits it, rather than sending
    // an empty Reply-To (the guard validates the address on anything present).
    ...(payload.email ? { senderEmail: payload.email } : {}),
    subject: REPORT_SUBJECT,
    context: {
      path: clamp(context.path, CONTEXT_MAX),
      // Our field is `pageUrl`. The collection's is `hostUrl`. Same value — the
      // host page as origin plus path, already stripped of its query and
      // fragment by `buildReportContext`, since a host's own URL can carry a
      // reset token.
      hostUrl: clamp(context.pageUrl, CONTEXT_MAX),
      locale: clamp(context.locale, CONTEXT_MAX),
      userAgent: clamp(context.userAgent, CONTEXT_MAX),
      // Already capped at 500 by `buildReportContext`.
      ...(context.error ? { error: clamp(context.error, CONTEXT_MAX) } : {}),
    },
    // `context.client` is deliberately NOT sent: the collection derives the
    // client from the authenticated API key, so passing our cached copy would
    // be a second, forgeable source for the same row.
  }

  // The parse deliberately sits OUTSIDE the try — see `createRegistration`: a
  // ZodError looks exactly like a refusal body to `asRefusal`.
  let response: unknown

  try {
    response = await requestJson({
      method: 'POST',
      path: '/user-messages',
      // The token moved out of the body and onto the shared header, because
      // the guard that reads it is a plugin above every collection and cannot
      // know one body shape from another — the same header
      // `createRegistration` already sends.
      init: { headers: { [TURNSTILE_HEADER]: payload.turnstileToken } },
      json,
    })
  } catch (error) {
    throw asRefusal<UserMessageErrorCode>(
      error,
      (code, message) => new UserMessageRefusedError(code, message),
      'Message refused',
    )
  }

  return UserMessageResponseSchema.parse(response)
}

/**
 * The `POST /api/clients/report` body: the loader's observation, flattened onto the
 * mount it describes (#153).
 *
 * **This is the one place the two halves are joined, and it is deliberately a
 * transport type.** They used to be joined in `src/loader/`, as an `EmbedReport`
 * carried on the boot singleton beside the `EmbedFingerprint` it already
 * contained — two overlapping copies of one observation, and the object was then
 * handed to `requestJson` verbatim, so the wire shape was whatever the domain type
 * happened to be. Naming the body here makes the flattening explicit at the call
 * site, keeps the observation free of anything about the request, and means adding
 * a field to `EmbedFingerprint` no longer silently sends it.
 */
export type EmbedReportBody = EmbedFingerprint & MountParts

// The confirmation returned by `POST /api/clients/report` (EmbedReportResponse).
// `ok` is the whole receipt: the endpoint also returns the `mount` key it filed
// under, and `stored: false` when it suppressed an unchanged report within the
// hour, but nothing here consumes either — so they are deliberately NOT in the
// schema. Pinning a field we never read would turn a harmless rename on the CMS
// side into a "could not record this embed" warning on every host's console, which
// is a worse failure than the drift it would be detecting.
const EmbedReportResponseSchema = z.object({ ok: z.literal(true) })

export type EmbedReportResponse = z.infer<typeof EmbedReportResponseSchema>

/**
 * Tells SahajCloud what this embed looks like from the inside — `POST
 * /api/clients/report` (sydevs/SahajCloud#633, issue #153).
 *
 * Called once per page from `lib/embed-announce.ts`, never from a component and
 * never through React Query: it is not data anything renders, it takes no part in a
 * cache, and a retry would be a second write of a record the server already
 * collapses by the hour.
 *
 * The report goes over the wire whole, `canonicalViable` included — the endpoint's
 * Zod schema strips what it does not model. The only two fields that could carry
 * anything of the host's are `origin` and `pathname`, already reduced by
 * `mountParts` before they reach here. The rest are booleans this build computed
 * about itself.
 *
 * This throws on any non-2xx, `403` (an origin outside the client's allowlist, or
 * no allowlist at all) and `429` (the mount cap) included. There is nothing here
 * for a caller to recover, so the failure is a console diagnostic at the one call
 * site — never an exception in the host's page.
 */
const reportEmbed = async (body: EmbedReportBody): Promise<EmbedReportResponse> => {
  const response = await requestJson({ method: 'POST', path: '/clients/report', json: body })

  return EmbedReportResponseSchema.parse(response)
}

export default {
  createRegistration,
  sendUserMessage,
  reportEmbed,
}
