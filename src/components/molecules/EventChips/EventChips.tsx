import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { Chip } from '@/components/atoms/Chip'
import { useEventDisplay, type DisplayableEvent } from '@/hooks/use-event-display'
import { useLocale } from '@/hooks/use-locale'

export type EventChipsVariant = 'default' | 'compact'

export type EventChipsProps = {
  event: DisplayableEvent & { languages: string[]; title?: string }
  /**
   * `default`, the event header, names the type and every language.
   * `compact`, the list card, shows only what the rest of the card does not
   * already say. So it drops a recurring class's type (the card reads "Every
   * Tuesday"), "Today" (the card's facts say it), the viewer's own language,
   * and a language the title already names.
   */
  variant?: EventChipsVariant
  className?: string
}

/**
 * The event's triage chips. Up to three: the class type, the language(s)
 * combined into one chip, and a single availability chip, "Full" or "Today".
 * All are neutral except "Today", the one worth noticing. The list card and the event header share this component, so the two never
 * drift. `compact` trims the redundant chips on the card.
 */
export function EventChips({ event, variant = 'default', className }: EventChipsProps) {
  const { t } = useTranslation()
  const { languageCode: uiLanguage, languageLabel } = useLocale()
  const { display, typeLabel } = useEventDisplay(event)

  const compact = variant === 'compact'

  // Type: `default` always names it. `compact` skips any recurring class, whose
  // "Weekly class" only restates the "Every Tuesday" right above it.
  const showType = !compact || display.kind !== 'class'

  // All languages fold into a single chip. `compact` keeps only the ones that
  // differ from the viewer's UI language and that the title does not name.
  const title = event.title?.toLowerCase() ?? ''
  const languages = compact
    ? event.languages.filter(
        (code) =>
          code.split('-')[0] !== uiLanguage && !title.includes(languageLabel(code).toLowerCase()),
      )
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
  const full = display.full
  //
  // `compact` leaves "Today" to the card's facts, which show it on its own tinted line.
  const today = !compact && !full && display.status === 'today'

  if (!showType && !languageText && !full && !today) return null

  return (
    <div className={clsx('flex flex-wrap items-center gap-1', className)}>
      {showType && <Chip>{typeLabel}</Chip>}
      {languageText && <Chip>{languageText}</Chip>}
      {full && <Chip>{t('event.display.chip_full')}</Chip>}
      {today && <Chip color="primary">{t('event.display.chip_today')}</Chip>}
    </div>
  )
}
