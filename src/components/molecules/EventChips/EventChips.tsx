import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { Chip } from '@/components/atoms/Chip'
import { useEventDisplay, type DisplayableEvent } from '@/hooks/use-event-display'
import { useLocale } from '@/hooks/use-locale'

export type EventChipsVariant = 'default' | 'compact'

export type EventChipsProps = {
  event: DisplayableEvent & { languages: string[] }
  /**
   * `default`, the event header, names the type where the listing has one, and
   * every language.
   * `compact`, the list card, drops the plain weekly-class type and the
   * viewer's own language. Those are the chips that add nothing at a
   * glance.
   */
  variant?: EventChipsVariant
  className?: string
}

/**
 * The event's triage chips, all `flat`: on the class page, Online for an online class
 * (primary); the class type (primary), the language(s) combined into one chip (secondary), and a
 * single availability chip: on a card, "Registration closed" (neutral) for a started course;
 * "Full" (neutral); or, on a card, "Today" (contrast). The
 * list card and the event header share this component, so the two never
 * drift. `compact` trims the redundant chips on the card.
 */
export function EventChips({ event, variant = 'default', className }: EventChipsProps) {
  const { t } = useTranslation()
  const { languageCode: uiLanguage, languageLabel } = useLocale()
  const { display, typeLabel, isDefaultType, recurrenceLine } = useEventDisplay(event)

  const compact = variant === 'compact'

  // Type: `default` names it, where there is one — a by-request listing has none.
  // `compact` skips the plain weekly class, whose label adds nothing on a compact card.
  const showType = typeLabel !== null && (!compact || !isDefaultType)

  // All languages fold into a single chip. `compact` keeps only the ones
  // that differ from the viewer's UI language.
  const languages = compact
    ? event.languages.filter((code) => code.split('-')[0] !== uiLanguage)
    : event.languages
  const languageText = languages.length
    ? languages.map((code) => languageLabel(code)).join(', ')
    : null

  // At most ONE availability chip renders. "Full" supersedes "Today". When
  // the session is today but cannot be joined, availability is the more
  // actionable fact. Two chips reading "Full · Today" would invite the
  // reader to act on the one that no longer applies. This matches the
  // resolver's `statusChip` precedence. The resolver guarantees `full` is
  // set only when it is the actual blocker, so an ended or dormant event
  // still falls through to its own treatment.
  // A course that has started takes no more sign-ups. The class page says so on its Register
  // button; a card says it with a grey tag, so nobody taps in to find out (Anton, 6 Nov). It
  // supersedes the other two: a started course is never reported full, and "Today" would invite
  // a visit the course no longer takes.
  const closed = compact && display.registration === 'closed'
  const full = !closed && display.full
  // "Today" appears once. The class page says it in the when line right below these chips,
  // and a one-off card leads with it. So only a card that leads with the weekly pattern,
  // "Every Wednesday", needs the chip.
  const today = !closed && !full && display.status === 'today' && compact && Boolean(recurrenceLine)
  // A card says Online beside its title, in this same soft teal tag (EventListItem), so only the
  // class page shows it here, leading its tags.
  const online = !compact && display.online

  if (!online && !showType && !languageText && !closed && !full && !today) return null

  return (
    // On the class page the tags must show above the phone sheet's Register bar, so
    // `useSheetFit` counts them when it sizes the sheet. The list card has no such bar.
    <div
      className={clsx('flex flex-wrap items-center gap-1', className)}
      data-sheet-fold={compact ? undefined : ''}
    >
      {online && <Chip color="primary">{t('event.display.online')}</Chip>}
      {showType && <Chip color="primary">{typeLabel}</Chip>}
      {languageText && <Chip color="secondary">{languageText}</Chip>}
      {closed && <Chip color="neutral">{t('event.display.registration_closed')}</Chip>}
      {full && <Chip color="neutral">{t('event.display.chip_full')}</Chip>}
      {today && <Chip color="contrast">{t('event.display.chip_today')}</Chip>}
    </div>
  )
}
