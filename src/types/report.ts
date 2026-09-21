import z from 'zod'

// The report-issue form is AUTHORED (issue #216): `sy-atlas-config.reportIssueForm` names a
// `contact` form on SahajCloud, and its blocks are the questions a viewer answers. So this file
// describes that document, not a fixed pair of fields. Everything else — the widget path, host
// page, locale, client, user agent, the error that prompted it — is auto-attached context
// assembled by `buildReportContext` (src/lib/report.ts), not something a viewer types.

export const REPORT_MESSAGE_MIN = 10
export const REPORT_MESSAGE_MAX = 5000
/** The intake's own bound on a sender address (SahajCloud#602). */
export const REPORT_EMAIL_MAX = 254

// Every authored input carries these three. `label` is the only copy the widget has for the
// field: it is authored on SahajCloud, in one language, so it is NOT translated here.
const inputShape = {
  name: z.string().min(1),
  label: z.string().nullish(),
  required: z.boolean().nullish(),
}

/**
 * The form-builder blocks this widget renders.
 *
 * `country` and `state` are deliberately here, rendered as plain text inputs: the widget has no
 * authored option list for either, and the answer travels as a string whichever control collects
 * it. Dropping them instead would lose a question the operator asked, silently.
 */
export const ReportFormFieldSchema = z.discriminatedUnion('blockType', [
  z.object({ ...inputShape, blockType: z.literal('text'), defaultValue: z.string().nullish() }),
  z.object({ ...inputShape, blockType: z.literal('textarea'), defaultValue: z.string().nullish() }),
  z.object({ ...inputShape, blockType: z.literal('email') }),
  z.object({ ...inputShape, blockType: z.literal('country') }),
  z.object({ ...inputShape, blockType: z.literal('state') }),
  z.object({ ...inputShape, blockType: z.literal('number'), defaultValue: z.number().nullish() }),
  z.object({
    ...inputShape,
    blockType: z.literal('select'),
    defaultValue: z.string().nullish(),
    placeholder: z.string().nullish(),
    options: z.array(z.object({ label: z.string(), value: z.string() })).nullish(),
  }),
  z.object({
    ...inputShape,
    blockType: z.literal('checkbox'),
    defaultValue: z.boolean().nullish(),
  }),
  // Authored prose, not a question. It has no `name` and contributes no answer.
  z.object({ blockType: z.literal('message'), message: z.unknown().nullish() }),
])

export type ReportFormField = z.infer<typeof ReportFormFieldSchema>

/**
 * The authored form, as the widget reads it.
 *
 * ⚠ **`recipient` and `client` are absent by design, and must stay absent.** The widget's read
 * selects neither (`getReportForm`), and delivery resolves the recipient server-side. A schema
 * that named either would invite a `select` that asks for it, and hand a manager's address to
 * every browser on every host page.
 *
 * `fields` stays `unknown[]` here and is narrowed by `renderableFields` (`src/lib/report-form.ts`)
 * instead. A block type this build does not know about must not fail the whole read, and
 * `confirmationType` is an open string for the same reason: a third value added upstream would
 * otherwise take the report path down rather than fall back to our own copy.
 */
export const ReportFormSchema = z.object({
  id: z.number(),
  fields: z.array(z.unknown()).nullish(),
  submitButtonLabel: z.string().nullish(),
  confirmationType: z.string().nullish(),
  confirmationMessage: z.unknown().nullish(),
})

export type ReportForm = z.infer<typeof ReportFormSchema>
