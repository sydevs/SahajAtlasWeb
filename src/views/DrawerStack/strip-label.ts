import type { StackEntry } from '@/lib/shape'

/**
 * What a peek strip is NAMED.
 *
 * Every strip used to say `t('back')`. So a three-deep stack handed a screen-reader user three
 * identically-named buttons, each going to a different place — the duplicate accessible-name
 * finding in issue #102. A name that does not distinguish its target is worse than a generic
 * one. It reads as a mistake in the page, rather than a limit of it.
 *
 * Names come from caches the app has already filled. The caller reads them cache-only, exactly
 * as `DrawerChrome` does, so a miss costs the specific name, never the strip. The fallback chain
 * is ordered so the label always degrades to something true: the region's name, then its slug,
 * then the plain "Back" every strip used to say.
 *
 * This function lives beside `DrawerStack`, rather than inside it, because it is pure.
 * Importing `DrawerStack.tsx` to test one string would pull mapbox-gl, vaul, and every eager
 * view into the node lane. The caches arrive as plain data for the same reason.
 */
/**
 * Only the two shapes of call this module makes.
 *
 * This type is narrower than i18next's `TFunction` on purpose. It accepts the `t` from either
 * `useTranslation('common')` or `useLocale()` — whose type targets the default namespace —
 * without either caller casting.
 */
export type StripTranslate = (key: string, options?: { title: string }) => string

export type StripNaming = {
  t: StripTranslate
  /**
   * Region names by slug. This is a Map, not the region array it comes from.
   *
   * `stripLabel` runs once per strip per render of the whole drawer stack, and the region tree
   * is the global list. A `.find()` here would scan every region in the world, per strip, per
   * render.
   */
  regionNames?: ReadonlyMap<string, string>
  titles?: ReadonlyMap<number, string>
}

export function stripLabel(
  entry: StackEntry | undefined,
  { t, regionNames, titles }: StripNaming,
): string {
  // The root ancestor is the countries index. `resolveStack` has no entry for it. It is also
  // unique within any stack — there is only ever one root — so the bare "Back" it falls
  // through to cannot collide with a sibling strip.
  if (!entry) return t('back')

  const title = (() => {
    switch (entry.kind) {
      case 'region':
        return regionNames?.get(entry.slug) ?? entry.slug
      case 'event':
        return titles?.get(entry.id)
      case 'online':
        return t('online_classes')
      case 'search':
        return t('search')
      case 'calendar':
        return t('calendar.title')
      case 'filters':
        return t('filters.title')
      // `register` and `share` are leaves — neither can be an ancestor — so there is no
      // name here worth pulling a second namespace into this file for.
      default:
        return undefined
    }
  })()

  return title ? t('back_to', { title }) : t('back')
}
