import type { EventRegistrationErrorCode } from '@/types/payload/response-types'
import type { EmbedFingerprint } from '@/loader/detect'
import type { MountParts } from '@/lib/mount'
import type { ReportPayload } from '@/lib/report'
import type { Registration } from '@/types'

import z from 'zod'

import { activeLocale, requestJson } from './client'

/**
 * This is the one public intake. Registrations, issue reports, mailing-list opt-ins and event
 * proposals are all rows on it, told apart by `type`. See sydevs/SahajCloud#695 and #800.
 */
const SUBMISSIONS_PATH = '/user-submissions'

/**
 * This is Payload's create envelope, `201 { doc, message }`.
 *
 * **This pins only `doc.id`, deliberately.** Nothing here renders any of it. Pinning a field this
 * code never reads would turn a harmless CMS-side rename into a failed submission for every
 * sender. `id` is the one member that cannot be renamed, since it is Payload's primary key, and
 * requiring it is what distinguishes a real create from any other 2xx body.
 *
 * `uuid` is the submission's own handle. The create issues it in the same request, rather than a
 * later job, so a registrant has it the moment the promise resolves. It is optional here for the
 * reason above: nothing reads it yet.
 */
const SubmissionResponseSchema = z.object({
  doc: z.object({ id: z.number(), uuid: z.string().optional() }),
})

export type SubmissionResponse = z.infer<typeof SubmissionResponseSchema>

/**
 * This is everything a submission carries beyond its own columns, as the collection wants it:
 * `[{ field, value }]` rather than an object.
 *
 * SahajCloud bounds the keys per `type` and refuses an unknown one with a 400 naming it. So a key
 * added here has to exist in that collection's `submissionData.ts` first.
 *
 * A blank value is dropped rather than sent. Every key is optional, and an empty answer is not one.
 */
const submissionData = (entries: Record<string, string | undefined>) =>
  Object.entries(entries)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([field, value]) => ({ field, value }))

/**
 * These are the codes a registration write can be refused with.
 *
 * A registration can be refused for a state reason.
 * The event is closed to registration even though the client could read it: external mode, ended, a started course, or full.
 * SahajCloud answers those with `409` plus a stable, machine-readable `code`. See SahajCloud#601.
 * So the widget can render its own localized copy instead of the endpoint's English prose.
 * `code` is typed as the synced contract union, but this file deliberately does NOT validate it.
 * A code this build does not know about is a copy problem, not a data problem, and the form falls back to the generic error message for it.
 *
 * `captcha_failed` is deliberately NOT in the synced `EventRegistrationErrorCode` union. It is added here instead.
 * The two come from different places.
 * The endpoint's own union describes the state refusals it raises itself.
 * `captcha_failed` is thrown one layer above it, by SahajCloud's write-guard plugin.
 * That plugin gates every client-originated write the same way. See sydevs/SahajCloud#629.
 *
 * ⚠ **This code is also not in that union YET, and the ordering is the reason.**
 * #629 is blocked on this change landing.
 * The widget has to send the header before the server may start requiring it.
 * So at the time of writing, no SahajCloud build emits this code, and a `pnpm types:cms` run would not produce it.
 * Widening the type here, rather than waiting, lets the client be ready first.
 * If a later re-sync folds `captcha_failed` into the synced union, this extra member becomes redundant and can go.
 * Nothing breaks either way.
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
 * The SDK throws a `PayloadSDKError` carrying the response body's `errors` array verbatim.
 * So a refusal's `code` rides through untouched.
 * This schema duck-types the error, instead of checking `instanceof PayloadSDKError`.
 * So this code depends on the shape, not the class identity.
 *
 * ⚠ **The code sits in one of two places, and this schema accepts both.**
 * Every route the widget writes to is collection-backed now, so it goes through Payload's own `formatErrors`, which nests the `APIError` payload under `data`.
 * The flat `errors[].code` is what the hand-written register endpoint built before SahajCloud#800 deleted it.
 * Dropping either position would silently stop recognizing a whole class of refusal.
 * Each one would fall through `asRefusal` untouched, and the form would show its generic "try again" sentence instead of the copy written for each case.
 * A regression test pins this behavior.
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

/** This returns the code from one error entry, from whichever of the two positions carries it. */
const entryCode = (entry: { code?: string; data?: { code?: string } }) =>
  entry.code ?? entry.data?.code

/**
 * This re-casts a thrown SDK error as the caller's own refusal class, when the body carries a `code`.
 * Any other failure, such as a network error, a 404, or a validation error, passes through untouched.
 *
 * This is one helper for both mutations.
 * Every coded refusal SahajCloud sends has this same body shape.
 * The alternative would be each endpoint growing its own near-copy, with the next one inheriting whichever spelling it happened to land beside.
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
 * This is the header every client-originated write carries its solved Turnstile token in.
 *
 * This uses a header, not a body field, with the same name on every endpoint.
 * The write-guard that reads it is a plugin sitting above the handlers, so it cannot know one endpoint's body shape from another's.
 * #171 moves the report form onto the same header.
 */
export const TURNSTILE_HEADER = 'x-turnstile-token'

/**
 * This registers a viewer for one occurrence of an event.
 *
 * ⚠ **The refusal is still synchronous, and that is what makes this usable.**
 * `gateRegistration` runs as a `beforeValidate` on the create, so a full, ended, closed or
 * external event is refused by the request that tried to register — not screened out later by a
 * job. The form can therefore say why, and a resolved promise means a real row.
 *
 * ⚠ **The confirmation EMAIL is not.** It used to be sent inside the 201, best-effort; it is a
 * delivery job now, with retries and an activity log. So the same rule `sendReport` has always
 * carried applies here too: a 201 means the registration was accepted, not that anything reached
 * the registrant's inbox. `registration.form.followup` already words it as "shortly", which is
 * still honest — do not tighten that copy into a claim of arrival.
 */
const createRegistration = async (
  eventId: number,
  data: Registration,
  turnstileToken: string,
): Promise<SubmissionResponse> => {
  // Only the REQUEST is guarded here.
  // A `.parse()` call inside this try would hand `asRefusal` a `ZodError`.
  // A `ZodError`'s `.errors` field is `{ message, code }`, the very shape a refusal body has.
  // So schema drift would get re-cast as a server refusal carrying a zod issue code.
  let response: unknown

  try {
    // `request` throws a `PayloadSDKError` on a non-2xx response.
    // So a failed registration still rejects to the caller.
    response = await requestJson({
      method: 'POST',
      path: SUBMISSIONS_PATH,
      // `sdk.request` merges these headers over its `baseInit` headers.
      // `interceptFetch` then adds auth and the locale on top.
      // So the token rides alongside them, and replaces nothing. See `applyRequestContext`.
      init: { headers: { [TURNSTILE_HEADER]: turnstileToken } },
      json: {
        type: 'registration',
        event: eventId,
        startingAt: data.startingAt.toISOString(),
        // The collection's own column for who sent this. It is what the confirmation goes to,
        // and what the sender's history across all four intakes is keyed on.
        senderEmail: data.email,
        submissionData: submissionData({
          name: data.name,
          // This is the registrant's language.
          // So SahajCloud sends the confirmation email, and its reminders, in the language they registered in.
          // The CMS otherwise falls back to its own default, English for everyone.
          // This is the same resolved language the request's `locale` param carries.
          // So there is one definition of "what language is this."
          // SahajCloud REJECTS an unknown code, rather than defaulting.
          // So this value must stay a subset of SahajCloud's LOCALES. All ten widget languages have been in it since SahajCloud#578.
          locale: activeLocale(),
          ...data.questions,
        }),
      },
    })
  } catch (error) {
    throw asRefusal<RegistrationErrorCode>(
      error,
      (code, message) => new RegistrationRefusedError(code, message),
      'Registration refused',
    )
  }

  return SubmissionResponseSchema.parse(response)
}

/**
 * These are the codes ANY user submission can be refused with, which is why the name is the
 * collection's and not one intake's.
 *
 * This mirrors `AntiSpamCode` in SahajCloud's `src/lib/antiSpam/antiSpamGuard.ts`, which is the real definition.
 * The write-guard plugin sitting above the collection raises every one of these, not the collection itself.
 * So it raises them for a registration too. `RegistrationErrorCode` folds in the one of these the
 * registration form has copy for, and the rest reach it as an unknown code.
 * `pnpm types:cms` does NOT sync this union.
 * That command covers `responseTypes.ts` and the generated `Config`, and this union lives in neither.
 * So this file restates it, the same way `RegistrationErrorCode` restates `captcha_failed`.
 *
 * All five codes are reachable for the report form.
 * `invalid_email` is belt-and-braces. The widget validates the address with zod before sending.
 * But the guard checks `senderEmail` itself, so this code can still come back.
 */
export type UserSubmissionErrorCode =
  | 'captcha_failed'
  | 'captcha_unavailable'
  | 'invalid_email'
  | 'disposable_email'
  | 'urls_not_allowed'

/**
 * This is a user submission SahajCloud refused for a reason the write-guard named.
 * So the caller can render its own localized copy instead of the guard's English prose.
 * The report path throws this. The registration path throws `RegistrationRefusedError` instead,
 * since its gate adds four codes of its own that this class cannot carry.
 * This arrives as a 403 for `captcha_failed`, a 400 for the email and URL checks, or a 500 for `captcha_unavailable`.
 * The code always sits at `errors[].data.code`. See `RefusalBodySchema`.
 */
export class UserSubmissionError extends Error {
  readonly code: UserSubmissionErrorCode

  constructor(code: UserSubmissionErrorCode, message: string) {
    super(message)
    this.name = 'UserSubmissionError'
    this.code = code
  }
}

/** This is the caller's label for this channel. It becomes the email's subject line. */
const REPORT_SUBJECT = 'Issue report'

/**
 * This is the collection's own bound on one `submissionData` value.
 *
 * The server bounds every value, and an over-long one gets a 400 FOR THE WHOLE SUBMISSION.
 * That 400 is a `ValidationError`, which carries no code, so it reaches the sender as the generic
 * failure, with everything they typed lost.
 *
 * So both forms stop the viewer AT this figure, rather than truncating prose they wrote and never
 * saying so. Truncation is for the values this code builds — above all `userAgent`, the one piece
 * of foreign input in the report's context. Losing a bug report to a long browser string would be
 * the worst possible trade, and a truncated user agent still identifies the browser.
 *
 * The bound is `DEFAULT_MAX_VALUE_LENGTH` in SahajCloud's `src/collections/UserSubmissions/submissionData.ts`.
 * `message` and `error` are allowed 5000 there, and this stays at the lower figure for both:
 * the form already bounds the message, and `buildReportContext` already caps `error` at 500.
 */
export const SUBMISSION_VALUE_MAX = 2000

const clamp = (value: string, max: number) => value.slice(0, max)

/**
 * This sends a viewer's issue report as a `contact` submission.
 * See sydevs/SahajCloud#632, #695 and #800, and issues #80, #103, and #171.
 * This is a shared, general-purpose intake.
 * The write-guard Turnstile-verifies it and screens it for spam synchronously.
 * A background job then screens it more deeply and delivers it to `contact@sydevelopers.com`, with the sender's address as `Reply-To`.
 * This caller supplies the Atlas framing, the subject. The collection carries none of it.
 *
 * **No `form` is named.** `deliverContact` resolves a form-less row to the system contact address,
 * which is exactly this channel's one fixed destination, and a form would otherwise decide the
 * recipient and widen the keys the row may carry.
 *
 * ⚠ **The deployed collection refuses that today, and this call 400s because of it.**
 * `needsForm` makes `form` required for every `contact` row, so the create is rejected with
 * `form: This field is required.` — a `ValidationError`, which carries no `errors[].data.code`, so
 * it reaches the viewer as the generic failure. The CMS contradicts itself here: its delivery
 * layer documents a form-less contact row as legitimate for this widget while its validator
 * refuses one. Tracked on sydevs/SahajCloud#813, where the fix belongs — in `needsForm`, not in a
 * form id invented here. Sending one would need a `forms` read this client cannot make, and would
 * pick the recipient from the browser.
 *
 * ⚠ **A 201 means ACCEPTED, not delivered.**
 * This replaced a root endpoint whose email WAS the deliverable, and which answered 502 rather than a false 200 when the send failed.
 * Delivery now happens minutes later, in a job.
 * So a failed send reaches SahajCloud admins as a `failed` row, and can no longer reach the sender at all.
 * So the form's success copy promises receipt, not delivery. See `report.sent`.
 *
 * It is still true that the form must never show its "sent" screen off anything but a resolved promise.
 * Every non-2xx response reaches the caller as a throw.
 */
const sendReport = async (payload: ReportPayload): Promise<SubmissionResponse> => {
  const { context } = payload

  const json = {
    type: 'contact',
    // A blank optional input registers as `''`.
    // This omits it, instead of sending an empty Reply-To. The guard validates the address on anything present.
    ...(payload.email ? { senderEmail: payload.email } : {}),
    submissionData: submissionData({
      subject: REPORT_SUBJECT,
      message: payload.message,
      path: clamp(context.path, SUBMISSION_VALUE_MAX),
      // Our field is `pageUrl`. The collection's field is `hostUrl`. Both carry the same value.
      // That value is the host page as origin plus path.
      // `buildReportContext` already strips its query and fragment, since a host's own URL can carry a reset token.
      hostUrl: clamp(context.pageUrl, SUBMISSION_VALUE_MAX),
      locale: clamp(context.locale, SUBMISSION_VALUE_MAX),
      userAgent: clamp(context.userAgent, SUBMISSION_VALUE_MAX),
      // `buildReportContext` already caps this at 500.
      error: context.error && clamp(context.error, SUBMISSION_VALUE_MAX),
    }),
    // This deliberately does NOT send `context.client`.
    // The collection derives the client from the authenticated API key.
    // So passing our cached copy would be a second, forgeable source for the same row.
  }

  // The parse deliberately sits OUTSIDE the try. See `createRegistration`.
  // A `ZodError` looks exactly like a refusal body to `asRefusal`.
  let response: unknown

  try {
    response = await requestJson({
      method: 'POST',
      path: SUBMISSIONS_PATH,
      // The token moved out of the body and onto the shared header.
      // The guard that reads it is a plugin above every collection, so it cannot know one body shape from another.
      // This is the same header `createRegistration` already sends.
      init: { headers: { [TURNSTILE_HEADER]: payload.turnstileToken } },
      json,
    })
  } catch (error) {
    throw asRefusal<UserSubmissionErrorCode>(
      error,
      (code, message) => new UserSubmissionError(code, message),
      'Report refused',
    )
  }

  return SubmissionResponseSchema.parse(response)
}

/**
 * This is the `POST /api/clients/report` body: the loader's observation, flattened onto the mount it describes. See #153.
 *
 * **This is the one place the two halves are joined, and it is deliberately a transport type.**
 * They used to be joined in `src/loader/`, as an `EmbedReport` carried on the boot singleton beside the `EmbedFingerprint` it already contained.
 * That was two overlapping copies of one observation, and the code then handed the object to `requestJson` verbatim.
 * So the wire shape was whatever the domain type happened to be.
 * Naming the body here makes the flattening explicit at the call site.
 * It keeps the observation free of anything about the request.
 * It also means adding a field to `EmbedFingerprint` no longer silently sends it.
 */
export type EmbedReportBody = EmbedFingerprint & MountParts

// This is the confirmation `POST /api/clients/report` returns, `EmbedReportResponse`.
// `ok` is the whole receipt this schema checks.
// The endpoint also returns the `mount` key it filed under, and `stored: false` when it suppressed an unchanged report within the hour.
// Nothing here consumes either field, so they are deliberately NOT in this schema.
// Pinning a field this code never reads would turn a harmless rename on the CMS side into a "could not record this embed" warning on every host's console.
// That failure would be worse than the drift it would be detecting.
const EmbedReportResponseSchema = z.object({ ok: z.literal(true) })

export type EmbedReportResponse = z.infer<typeof EmbedReportResponseSchema>

/**
 * This tells SahajCloud what this embed looks like from the inside.
 * It calls `POST /api/clients/report`. See sydevs/SahajCloud#633 and issue #153.
 *
 * `lib/embed-announce.ts` calls this once per page, never from a component and never through React Query.
 * Nothing renders this as data, it takes no part in a cache, and a retry would be a second write of a record the server already collapses by the hour.
 *
 * The report goes over the wire whole, `canonicalViable` included.
 * The endpoint's Zod schema strips what it does not model.
 * Only two fields could carry anything of the host's: `origin` and `pathname`. `mountParts` already reduces both before they reach here.
 * The rest are booleans this build computed about itself.
 *
 * This throws on any non-2xx response.
 * That includes `403`, an origin outside the client's allowlist or no allowlist at all, and `429`, the mount cap.
 * There is nothing here for a caller to recover.
 * So the failure becomes a console diagnostic at the one call site, never an exception in the host's page.
 */
const reportEmbed = async (body: EmbedReportBody): Promise<EmbedReportResponse> => {
  const response = await requestJson({ method: 'POST', path: '/clients/report', json: body })

  return EmbedReportResponseSchema.parse(response)
}

export default {
  createRegistration,
  sendReport,
  reportEmbed,
}
