import z from 'zod'

/**
 * `GET /api/globals/sy-atlas-config` — the Sahaj Atlas configuration global.
 *
 * The widget reads exactly one field from it: **`languages`**, the set an operator says the
 * atlas is offered in (sydevs/SahajCloud#645). It is what drives the settings picker and, on
 * SahajCloud's side, the `hreflang` cluster on every atlas page — so the two must agree, which
 * is the whole reason this read exists. The map defaults on the same global (`defaultMapCenter`,
 * `defaultZoomLevel`) are deliberately NOT selected: nothing reads them, and a schema that
 * demands a field we ignore turns a harmless CMS rename into a failed boot.
 *
 * ⚠ **`languages` is nullish, and that is not defensive habit.** A global read that `select`s a
 * column the server does not have answers `{}` with a **200, not a 400** — verified against
 * production, where this was the live answer until SahajCloud deployed the field mid-way through
 * writing this. So "absent" is a state the wire really produces, and it reaches us as a silent
 * empty object rather than an error: a fresh installation whose global predates the field, a
 * client key not granted it, a future rename. `offeredLanguages` (`config/i18n-options`) turns
 * absent-or-empty back into the bundles this build ships — the set the widget offered before the
 * field existed — so every one of those degrades to today's behaviour instead of an empty picker.
 *
 * Rows are `{ code }` rather than bare strings, and the field is named `languages` rather than
 * `locales`. Both are fixed upstream and documented on the field itself: a global's array field
 * generates a `<global>_<field>` sub-table, and `..._locales` collides with the table Payload
 * already uses for a localized document's values, which kills every read of the global in
 * Drizzle's relation builder.
 */
export const AtlasConfigSchema = z.object({
  languages: z
    .array(
      z.object({
        code: z.string(),
      }),
    )
    .nullish(),
})

export type AtlasConfig = z.infer<typeof AtlasConfigSchema>
