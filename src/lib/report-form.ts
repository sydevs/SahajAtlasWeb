import type { ReportForm, ReportFormField } from '@/types/report'

import z from 'zod'

import { REPORT_EMAIL_MAX, REPORT_MESSAGE_MIN, ReportFormFieldSchema } from '@/types/report'
import { USER_SUBMISSION_VALUE_MAX, userSubmissionValueMax } from '@/config/api/mutate'

/** A viewer's answers, keyed by `fieldKey` rather than by the authored name — see below. */
export type ReportValues = Record<string, string | boolean>

/**
 * The form key for the field at `index`.
 *
 * ⚠ **Authored names never reach react-hook-form.** A name is operator-typed, and RHF reads `.`
 * and `[]` in one as a PATH, so a field called `user.email` would register a nested object and
 * come back undefined at submit. The index is ours, so it can carry neither character. The
 * authored name is re-attached in `reportAnswers`, which is what SahajCloud matches on.
 */
export const fieldKey = (index: number): string => `f${index}`

/**
 * The authored blocks this build can render, in authoring order.
 *
 * A block type we do not know is dropped rather than thrown on. This form is the one a viewer
 * reaches BECAUSE something already failed, so a block added upstream must not be what takes it
 * down.
 */
export const renderableFields = (form: ReportForm | undefined): ReportFormField[] =>
  (form?.fields ?? []).flatMap((field) => {
    const parsed = ReportFormFieldSchema.safeParse(field)

    return parsed.success ? [parsed.data] : []
  })

/**
 * The validation for one authored form, derived from its own blocks.
 *
 * The bounds that are not the operator's to set stay ours: an address at the intake's own
 * `REPORT_EMAIL_MAX`, every other value at whatever the collection allows the name it will
 * travel under (`userSubmissionValueMax` — the raise is keyed on the NAME, not on the control,
 * so a textarea is not automatically prose-sized). ONE over-long value refuses the whole
 * submission as a bare `ValidationError` — no code, no field named, and everything the viewer
 * typed lost. A required textarea keeps `REPORT_MESSAGE_MIN`, so the "at least %{min}
 * characters" copy still describes what it gates.
 */
export const reportValuesSchema = (fields: ReportFormField[]) =>
  z.object(
    Object.fromEntries(
      fields.flatMap((field, index): [string, z.ZodTypeAny][] => {
        if (field.blockType === 'message') return []

        const key = fieldKey(index)

        switch (field.blockType) {
          case 'email': {
            // One bound, then the optional arm, so the two arms can never be given different
            // ceilings. An untouched optional input registers as `''`, which is not an address.
            const address = z.string().trim().email().max(REPORT_EMAIL_MAX)

            return [[key, field.required ? address : address.or(z.literal(''))]]
          }
          case 'textarea': {
            const prose = z.string().trim().max(userSubmissionValueMax(field.name))

            return [[key, field.required ? prose.min(REPORT_MESSAGE_MIN) : prose]]
          }
          case 'checkbox':
            // A required checkbox is a consent: `false` must fail it, not pass as an answer.
            return [[key, field.required ? z.literal(true) : z.boolean()]]
          default: {
            const value = z.string().trim().max(USER_SUBMISSION_VALUE_MAX)

            return [[key, field.required ? value.min(1) : value]]
          }
        }
      }),
    ) as z.ZodRawShape,
  )

/** The authored defaults, so a form opens as the operator set it up. */
export const reportDefaultValues = (fields: ReportFormField[]): ReportValues =>
  Object.fromEntries(
    fields.flatMap((field, index): [string, string | boolean][] => {
      if (field.blockType === 'message') return []

      const key = fieldKey(index)

      // Only a checkbox's default is a boolean. Every other control holds a string, and a block
      // that authors no default opens empty — including one added upstream later, which would
      // otherwise need a case here to keep its authored default.
      if (field.blockType === 'checkbox') return [[key, field.defaultValue ?? false]]

      return [[key, 'defaultValue' in field ? String(field.defaultValue ?? '') : '']]
    }),
  )

/**
 * The answers as the collection wants them, under the names the OPERATOR authored.
 *
 * SahajCloud allows exactly those names plus the base and `contact` keys, and refuses an unknown
 * one with a 400 naming it. A checkbox travels as `true`/`false`: an unchecked optional consent
 * is an answer, and a blank one would be dropped as if the question had never been asked.
 */
export const reportAnswers = (
  fields: ReportFormField[],
  values: ReportValues,
): Record<string, string> =>
  Object.fromEntries(
    fields.flatMap((field, index): [string, string][] =>
      field.blockType === 'message' ? [] : [[field.name, String(values[fieldKey(index)] ?? '')]],
    ),
  )

/**
 * The address a reply goes to: the first authored `email` block, if it was filled in.
 *
 * The convention is the block TYPE, not a reserved name, because the operator authors every name
 * and nothing on either side pins one. The answer also travels in `reportAnswers` under its
 * authored name, so the operator sees the question they asked answered, while `senderEmail` is
 * what the delivery job reads for `Reply-To`.
 */
export const reportSenderEmail = (
  fields: ReportFormField[],
  values: ReportValues,
): string | undefined => {
  const index = fields.findIndex((field) => field.blockType === 'email')

  if (index === -1) return undefined

  const value = values[fieldKey(index)]

  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
