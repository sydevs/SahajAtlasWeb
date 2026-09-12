import { z } from 'zod'

/**
 * This is the atlas-wide operator configuration, `sy-atlas-config`.
 *
 * Only `availableLocales` is read here: the set of languages an operator has switched on,
 * each of which SahajCloud has proven is PUBLISHED before it would let the field be saved
 * (sydevs/SahajCloud#705). So this list is a statement about translations that exist, not a
 * wish list — which is why the picker may offer it verbatim.
 *
 * The field is `nullish` on purpose. A config row saved before the field existed, or one a
 * `select` trimmed, answers `undefined`, and that is not a failure worth an error boundary.
 * `use-languages.ts` turns anything unusable into `['en']`.
 */
export const AtlasConfigSchema = z.object({
  availableLocales: z.array(z.string()).nullish(),
})

export type AtlasConfig = z.infer<typeof AtlasConfigSchema>
