import type { ListingDraft, ListingSection } from '@/lib/proposal'
import type { Event } from '@/types'

import { DateTime } from 'luxon'
import { useTranslation } from 'react-i18next'

import { useEventDisplay } from '@/hooks/use-event-display'
import { useLocale } from '@/hooks/use-locale'
import { draftTitle } from '@/lib/proposal'
import { zoneLabel } from '@/lib/time'

export type SummaryRow = {
  key: string
  label: string
  /** The value as one or more lines; empty when the visitor left it blank. */
  value: string
  section: ListingSection
}

/**
 * Every value a listing is sent with, as labelled lines, grouped by the step that sets it. Check
 * reads a new listing back from these, and a correction diffs two sets of them — so whatever is
 * sent is shown, in the same words, either way.
 *
 * `correction` drops the two values the widget never reads from a published class (its join link
 * and contact address): an unknown is not a blank, and must not read as one being changed.
 */
export function useSummaryRows(
  draft: ListingDraft,
  listing: Event,
  { correction = false, keepTitle }: { correction?: boolean; keepTitle?: string } = {},
): SummaryRow[] {
  const { t } = useTranslation()
  const { locale, languageLabel } = useLocale()
  const display = useEventDisplay(listing)
  const online = draft.eventType === 'online'
  const date = (iso: string) =>
    iso ? DateTime.fromISO(iso).setLocale(locale).toLocaleString(DateTime.DATE_HUGE) : ''
  const schedule = (display.recurrenceLine ? [display.recurrenceLine] : [display.whenLine])
    .concat(display.eventTimeRange ?? [])
    .join(' · ')

  const rows: (SummaryRow | false)[] = [
    {
      key: 'type',
      label: t('submit.summary.type'),
      value: t(online ? 'submit.where.online' : 'submit.where.offline'),
      section: 'where',
    },
    online
      ? {
          key: 'place',
          label: t('submit.where.city_label'),
          value: draft.city?.label ?? '',
          section: 'where',
        }
      : {
          key: 'place',
          label: t('submit.summary.address'),
          value: draft.address?.label ?? '',
          section: 'where',
        },
    // Said on Check because it is how the typed-in place reaches the coordinator.
    Boolean((online ? draft.city : draft.address)?.manual) && {
      key: 'manual',
      label: t('submit.summary.manual'),
      value: t('submit.summary.manual_value'),
      section: 'where',
    },
    !online && {
      key: 'room',
      label: t('submit.summary.room'),
      value: draft.room.trim(),
      section: 'where',
    },
    online &&
      !(correction && !draft.onlineUrl.trim()) && {
        key: 'link',
        label: t('submit.where.online_url_label'),
        value: draft.onlineUrl.trim(),
        section: 'where',
      },
    {
      key: 'schedule',
      label: t('submit.summary.schedule'),
      value: draft.startTime ? schedule : '',
      section: 'when',
    },
    {
      key: 'first',
      label: t(draft.repeats === 'once' ? 'submit.when.date' : 'submit.when.first_class'),
      value: date(draft.firstDate),
      section: 'when',
    },
    draft.repeats !== 'once' && {
      key: 'last',
      label: t('submit.when.last_class'),
      value: draft.endDate ? date(draft.endDate) : t('submit.summary.no_end'),
      section: 'when',
    },
    {
      key: 'zone',
      label: t('submit.summary.zone'),
      value: zoneLabel(draft.timeZone, locale),
      section: 'when',
    },
    {
      key: 'languages',
      label: t('submit.more.languages_label'),
      value: draft.languages.map(languageLabel).join(', '),
      section: 'details',
    },
    {
      key: 'contact',
      label: t('submit.summary.contact'),
      value: [draft.contactName, draft.contactPhone]
        .map((line) => line.trim())
        .filter(Boolean)
        .join('\n'),
      section: 'details',
    },
    !(correction && !draft.contactEmail.trim()) && {
      key: 'contact_email',
      label: t('submit.summary.contact_email'),
      value: draft.contactEmail.trim(),
      section: 'details',
    },
    {
      key: 'description',
      label: t('submit.about.description_label'),
      value: draft.description.trim(),
      section: 'details',
    },
    {
      key: 'title',
      label: t('submit.more.title_label'),
      // A correction left blank keeps the published name: that is what is sent, so it is shown.
      value: keepTitle !== undefined ? draft.title.trim() || keepTitle : draftTitle(draft),
      section: 'details',
    },
    {
      key: 'website',
      label: t('submit.more.website_label'),
      value: draft.website.trim(),
      section: 'details',
    },
  ]

  return rows.filter((row): row is SummaryRow => Boolean(row))
}

/**
 * The schedule as two lines a host can check at a glance: the pattern with its first date in
 * words ("Every Tuesday from 27 October"), then the times and the zone they are in. The first
 * date and the zone are inferred for the host, so they are spelled out rather than implied.
 * Empty until there is a first date and a start time.
 */
export function useScheduleLines(
  draft: ListingDraft,
  listing: Event,
): { pattern: string; time: string | null; zone: string } | null {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const display = useEventDisplay(listing)

  if (!draft.firstDate || !draft.startTime) return null

  const first = DateTime.fromISO(draft.firstDate).setLocale(locale)
  const date = first.toLocaleString({
    ...(draft.repeats === 'once' && { weekday: 'long' }),
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const pattern =
    draft.repeats === 'once' || !display.recurrenceLine
      ? date
      : t('submit.when.from', { pattern: display.recurrenceLine, date })

  return { pattern, time: display.eventTimeRange, zone: zoneLabel(draft.timeZone, locale) }
}
