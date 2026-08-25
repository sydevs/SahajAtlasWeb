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
 * ⚠ **`languages` is nullish, and that is not defensive habit.** SahajCloud ships the field
 * after this lands, and a global read that `select`s a column the server does not have yet
 * answers `{}` with a 200 — verified against production. So the absent case is the *current*
 * case, not a hypothetical one, and it has to parse. `offeredLanguages` (`config/i18n-options`)
 * turns absent-or-empty back into the bundles this build ships, which is exactly the set the
 * widget offered before the field existed.
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
