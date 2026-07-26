import { useMemo } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ScheduleXCalendar, useNextCalendarApp } from '@schedule-x/react'
import { createViewList, createViewMonthGrid, createViewWeek } from '@schedule-x/calendar'

import '@schedule-x/theme-default/dist/index.css'

import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import api from '@/config/api'
import { useAtlasNavigate } from '@/hooks/use-atlas-navigate'
import { useEventFilters } from '@/hooks/use-filters'
import { useLocale } from '@/hooks/use-locale'
import { useTheme } from '@/hooks/use-theme'
import { eventsToCalendarEntries, filtersKey } from '@/lib/shape'
import { CloseButton, DrawerTitle, FilterButton } from '@/views/shared'

// The full-width calendar (route `/calendar`, optionally `?region=<slug>`). Its entries
// are the filtered feed (`getCalendarEvents`) expanded into one per upcoming occurrence
// — timezone-correct, online events included — laid out on a Schedule-X month / week /
// list(agenda) grid whose `--sx-*` tokens are mapped to our theme (see globals.css).
// The view is placeless, so it never frames the map. Clicking an entry opens its
// EventView. It suspends on the cache-once source, so the calendar is built with the
// complete set on first render (Schedule-X captures its config once); changing filters
// returns here via the origin-aware apply, which REMOUNTS the view with the new set, and
// theme is followed through the CSS-var overrides (not `isDark`) — so a background refetch
// or host-locale change mid-view just won't live-update until the next navigation. The
// header mirrors SearchView (Filter + Close).

// Schedule-X validates `locale` against its own supported BCP-47 set and THROWS
// (`InvalidLocaleError`) on an unknown code — our short `en`/`de`/… crash it. Map our
// locales to the closest one SX 2.36 ships; anything unmapped (incl. Hungarian, which
// SX lacks) falls back to en-US chrome — our own header title stays localized via i18n.
const SX_LOCALES: Record<string, string> = {
  en: 'en-US',
  de: 'de-DE',
  fr: 'fr-FR',
  es: 'es-ES',
  cs: 'cs-CZ',
  nl: 'nl-NL',
  ru: 'ru-RU',
  uk: 'uk-UA',
  'pt-BR': 'pt-BR',
}

const toScheduleXLocale = (locale: string): string => SX_LOCALES[locale] ?? 'en-US'

export function CalendarView() {
  const { t } = useTranslation('common')
  const { locale } = useLocale()
  const { theme } = useTheme()
  const navigate = useAtlasNavigate()
  const filters = useEventFilters()

  const { data: source } = useSuspenseQuery({
    queryKey: ['calendar', filtersKey(filters), locale],
    queryFn: () => api.getCalendarEvents(filters),
  })

  const events = useMemo(() => eventsToCalendarEntries(source, filters), [source, filters])

  const calendar = useNextCalendarApp({
    views: [createViewMonthGrid(), createViewWeek(), createViewList()],
    events,
    isDark: theme === 'dark',
    // SX needs a supported BCP-47 code (see SX_LOCALES) or it throws; our token overrides
    // (globals.css) carry the light/dark + accent theming regardless of `isDark`.
    locale: toScheduleXLocale(locale),
    callbacks: {
      // Each entry carries its event's route; open the matching EventView (the atlas
      // navigate stamps camera/depth like every other in-widget push).
      onEventClick: (event) => {
        if (typeof event.path === 'string') navigate(event.path)
      },
    },
  })

  return (
    <>
      <DrawerHeader className="max-w-none justify-between">
        <DrawerTitle title={t('calendar.title')} />
        {/* Filter + Close as one right-aligned group, in the same order as SearchView. */}
        <div className="flex shrink-0 items-center gap-2">
          <FilterButton />
          <CloseButton />
        </div>
      </DrawerHeader>
      <DrawerBody className="max-w-none overflow-hidden p-0">
        <div className="sx-calendar">
          <ScheduleXCalendar calendarApp={calendar} />
        </div>
      </DrawerBody>
    </>
  )
}
