import type { SyAtlasTranslation } from '@/types/payload/payload-types'

import { z } from 'zod'

/**
 * This is one locale's UI copy, as `sy-atlas-translations` serves it.
 *
 * The schema is deliberately LIGHT: a tree of strings, any depth, no key list. The key list
 * is a contract already stated twice — by the CMS, which rejects an unknown key on write, and
 * by `translations.en.json`, which types every `t()` call site. Restating it here as a third
 * copy would mean a key added in SahajCloud and pulled with `pnpm sync:translations` could not
 * reach a running widget until this file was edited too, which is exactly the deploy this
 * ticket removes.
 *
 * What it DOES enforce is the shape i18next needs. A number, a null, or an object where a
 * string belongs would render as `[object Object]` or crash interpolation, and this turns that
 * into a boundary failure with a named cause instead.
 */
export type TranslationTree = { [key: string]: string | TranslationTree }

export const TranslationBundleSchema: z.ZodType<TranslationTree> = z.lazy(() =>
  z.record(z.union([z.string(), TranslationBundleSchema])),
)

/**
 * These are the tabs the widget reads. `emails` (SahajCloud sends registrant mail) and
 * `event.title` (the CMS's own auto-titles) are the two groups with live production data and
 * no widget surface, so neither is requested, committed to the snapshot, or typed into `t()`.
 */
export const WIDGET_TRANSLATION_TABS = [
  'common',
  'countries',
  'search',
  'filters',
  'online',
  'event',
  'calendar',
  'registration',
  'share',
  'compact',
] as const

/** These never reach i18next: Payload's own document metadata, and the two non-widget groups. */
export const TRANSLATION_METADATA_KEYS = ['id', '_status', 'createdAt', 'updatedAt'] as const

type WidgetEventStrings = Required<
  Pick<NonNullable<SyAtlasTranslation['event']>, 'display' | 'actions' | 'recurrence'>
>

/**
 * This is the CMS's own type for what the widget reads, minus the two groups it does not.
 *
 * `translations.en.json` is checked against it with `satisfies`, so a snapshot that has drifted
 * from the CMS — a group renamed upstream, a key dropped — fails `pnpm typecheck` rather than
 * rendering a raw key in front of a visitor.
 */
export type WidgetTranslations = Required<
  Pick<
    SyAtlasTranslation,
    | 'common'
    | 'countries'
    | 'search'
    | 'filters'
    | 'online'
    | 'calendar'
    | 'registration'
    | 'share'
    | 'compact'
  >
> & { event: WidgetEventStrings }
