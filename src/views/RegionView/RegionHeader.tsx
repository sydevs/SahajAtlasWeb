import type { RegionLevel } from '@/types'

import { useTranslation } from 'react-i18next'

import { NavHeader } from '@/views/nav'
import { CalendarButton } from '@/views/shared'

export type RegionHeaderProps = {
  slug: string
  /** The place's name, or nothing while it is still on its way (a placeholder line stands in). */
  title?: string
  /** The place's level and its own subtitle, which only a city shows. */
  level?: RegionLevel
  ownSubtitle?: string | null
  /** The page lists classes, not only places: it says once that every class is free. */
  listsClasses: boolean
}

/**
 * A place page's header: the Back row with the calendar (which opens scoped to this place), the
 * name, the breadcrumbs and the line under them. RegionView renders it, and so does its loading
 * placeholder (`views/fallbacks`) with what it can already tell, so the two can't drift apart and
 * the header keeps its height when the page arrives.
 *
 * The line under the name is a city's own subtitle, else "All classes are free" where the page
 * lists classes: it states that once per list, so no Free chip repeats on the cards.
 */
export function RegionHeader({ slug, title, level, ownSubtitle, listsClasses }: RegionHeaderProps) {
  const { t } = useTranslation()
  const subtitle =
    (level === 'city' ? ownSubtitle : undefined) ??
    (listsClasses
      ? t('common.chrome.all_classes_free', { defaultValue: 'All classes are free' })
      : undefined)

  return (
    <NavHeader
      breadcrumbs
      titlePending
      actions={<CalendarButton regionSlug={slug} />}
      subtitle={subtitle}
      title={title}
    />
  )
}
