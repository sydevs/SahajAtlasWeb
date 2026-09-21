import { z } from 'zod'

/**
 * This is the atlas-wide operator configuration, `sy-atlas-config`.
 *
 * `availableLocales` is the set of languages an operator has switched on,
 * each of which SahajCloud has proven is PUBLISHED before it would let the field be saved
 * (sydevs/SahajCloud#705). So this list is a statement about translations that exist, not a
 * wish list — which is why the picker may offer it verbatim.
 *
 * `reportIssueForm` names the `contact` form behind "Report an issue" (issue #216). It is read at
 * `depth: 0`, so it is the bare id, and an unset one hides the report path everywhere — the CMS
 * field says so, and a form-less `contact` row is refused by the collection anyway.
 *
 * Both fields are `nullish` on purpose. A config row saved before a field existed, or one a
 * `select` trimmed, answers `undefined`, and that is not a failure worth an error boundary.
 * `use-available-locales.ts` turns anything unusable into `['en']`; `use-report-form.ts` turns an
 * unusable `reportIssueForm` into "no report path".
 */
export const AtlasConfigSchema = z.object({
  availableLocales: z.array(z.string()).nullish(),
  reportIssueForm: z.number().nullish(),
})

export type AtlasConfig = z.infer<typeof AtlasConfigSchema>
