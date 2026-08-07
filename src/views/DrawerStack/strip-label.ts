import type { TFunction } from 'i18next'
import type { StackEntry } from '@/lib/shape'

/**
 * What a peek strip is NAMED.
 *
 * Every strip used to be `t('back')`, so a three-deep stack handed a screen-reader user
 * three identically-named buttons going to three different places — the duplicate
 * accessible-name finding in issue #102. A name that doesn't distinguish its target is
 * worse than a generic one: it reads as a mistake in the page rather than a limit of it.
 *
 * Names come from caches the app has already filled, which the caller reads cache-only
 * exactly as `DrawerChrome` does — so a miss costs the specific name, never the strip.
 * The fallback chain is ordered so the label always degrades to something true: the
 * region's name, then its slug, then the plain "Back" every strip used to say.
 *
 * It lives beside `DrawerStack` rather than inside it because it is pure, and importing
 * `DrawerStack.tsx` to test one string would pull mapbox-gl, vaul and every eager view
 * into the node lane. The caches arrive as plain data for the same reason.
 */
export type StripNaming = {
  t: TFunction<'common'>
  regions?: ReadonlyArray<{ slug: string; name?: string | null }>
  titles?: Map<number, string>
}

export function stripLabel(
  entry: StackEntry | undefined,
  { t, regions, titles }: StripNaming,
): string {
  // The root ancestor is the countries index, which `resolveStack` has no entry for. It
  // is also unique within any stack — there is only ever one root — so the bare "Back"
  // it falls through to cannot collide with a sibling strip.
  if (!entry) return t('back')

  const title = (() => {
    switch (entry.kind) {
      case 'region':
        return regions?.find((node) => node.slug === entry.slug)?.name ?? entry.slug
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
