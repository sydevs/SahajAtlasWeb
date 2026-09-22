import type { Form } from '@/types/payload/payload-types'

import z from 'zod'

// The report-issue form is AUTHORED (issue #216): `sy-atlas-config.reportIssueForm` names a
// `contact` form on SahajCloud, and its blocks are the questions a viewer answers. So this file
// describes that document, not a fixed pair of fields. Everything else — the widget path, host
// page, locale, client, user agent, the error that prompted it — is auto-attached context
// assembled by `buildReportContext` (src/lib/report.ts), not something a viewer types.

export const REPORT_MESSAGE_MIN = 10
/** The intake's own bound on a sender address (SahajCloud#602). */
export const REPORT_EMAIL_MAX = 254

// Every authored input carries these three. `label` is the only copy the widget has for the
// field: it is authored on SahajCloud, in one language, so it is NOT translated here.
const inputShape = {
  name: z.string().min(1),
  label: z.string().nullish(),
  required: z.boolean().nullish(),
}

/** The three blocks whose authored default is prose. */
const textInput = { ...inputShape, defaultValue: z.string().nullish() }

/**
 * The form-builder blocks this widget renders.
 *
 * `country` and `state` are deliberately here, rendered as plain text inputs: the widget has no
 * authored option list for either, and the answer travels as a string whichever control collects
 * it. Dropping them instead would lose a question the operator asked, silently.
 */
export const ReportFormFieldSchema = z.discriminatedUnion('blockType', [
  z.object({ ...textInput, blockType: z.literal('text') }),
  z.object({ ...textInput, blockType: z.literal('textarea') }),
  z.object({ ...inputShape, blockType: z.literal('email') }),
  z.object({ ...inputShape, blockType: z.literal('country') }),
  z.object({ ...inputShape, blockType: z.literal('state') }),
  z.object({ ...inputShape, blockType: z.literal('number'), defaultValue: z.number().nullish() }),
  z.object({
    ...textInput,
    blockType: z.literal('select'),
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

/**
 * The two schemas above, pinned to the synced SahajCloud types (`pnpm types:cms`) — the pattern
 * `RegistrationQuestionsSchema` uses in `event.ts`, for a sharper reason here.
 *
 * ⚠ **`renderableFields` DROPS a block it cannot parse**, on purpose, so an upstream addition
 * cannot take the report path down. That makes drift invisible: a renamed member turns an
 * operator's question into a field that silently stops rendering, with every gate green. `Pick`
 * fails the build instead — on a renamed block type through `SahajCloudBlock`'s own constraint, and on
 * a renamed member through the key list. It cannot see an ADDED block, which is the case the
 * drop was built for.
 *
 * ⚠ **The key lists stay written out.** Folding the shared `'name' | 'label' | 'required'` into a
 * generic helper needs `Extract<keyof …>` to type-check, which DROPS a renamed member instead of
 * failing on it — the one thing this pin exists to catch.
 *
 * Like every pin against `src/types/payload/`, it compares against a checked-in snapshot, so it
 * only fires once the resync has been run (#191). It is exported because nothing consumes it —
 * the type-checker reading it IS the check, and an unexported one would fail `noUnusedLocals`
 * instead of the drift it is watching for.
 */
type SahajCloudFormField = NonNullable<Form['fields']>[number]
type SahajCloudBlock<T extends SahajCloudFormField['blockType']> = Extract<
  SahajCloudFormField,
  { blockType: T }
>

export type PinnedToSahajCloud = [
  Pick<Form, 'id' | 'fields' | 'submitButtonLabel' | 'confirmationType' | 'confirmationMessage'>,
  Pick<SahajCloudBlock<'text'>, 'name' | 'label' | 'required' | 'defaultValue'>,
  Pick<SahajCloudBlock<'textarea'>, 'name' | 'label' | 'required' | 'defaultValue'>,
  Pick<SahajCloudBlock<'email'>, 'name' | 'label' | 'required'>,
  Pick<SahajCloudBlock<'country'>, 'name' | 'label' | 'required'>,
  Pick<SahajCloudBlock<'state'>, 'name' | 'label' | 'required'>,
  Pick<SahajCloudBlock<'number'>, 'name' | 'label' | 'required' | 'defaultValue'>,
  Pick<
    SahajCloudBlock<'select'>,
    'name' | 'label' | 'required' | 'defaultValue' | 'placeholder' | 'options'
  >,
  Pick<SahajCloudBlock<'checkbox'>, 'name' | 'label' | 'required' | 'defaultValue'>,
  Pick<SahajCloudBlock<'message'>, 'message'>,
]
