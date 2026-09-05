import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { Chip } from '@/components/atoms/Chip'
import { useEventDisplay, type DisplayableEvent } from '@/hooks/use-event-display'
import { useLocale } from '@/hooks/use-locale'

export type EventChipsVariant = 'default' | 'compact'

export type EventChipsProps = {
  event: DisplayableEvent & { languages: string[] }
  /**
   * `default`, the event header, names the type and every language.
   * `compact`, the list card, drops the plain weekly-class type and the
   * viewer's own language. Those are the chips that add nothing at a
   * glance.
   */
  variant?: EventChipsVariant
  className?: string
}

/**
 * The event's triage chips. Up to three, all `flat`: the class type
 * (primary), the language(s) combined into one chip (secondary), and a
 * single availability chip, "Full" (neutral) or "Today" (contrast). The
 * list card and the event header share this component, so the two never
 * drift. `compact` trims the redundant chips on the card.
 */
export function EventChips({ event, variant = 'default', className }: EventChipsProps) {
  const { t } = useTranslation('events')
  const { languageCode: uiLanguage, languageLabel } = useLocale()
  const { display, typeLabel, isDefaultType } = useEventDisplay(event)

  const compact = variant === 'compact'

  // Type: `default` always names it. `compact` skips the plain weekly class,
  // whose label adds nothing on a compact card.
  const showType = !compact || !isDefaultType

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
  const full = display.full
  const today = !full && display.status === 'today'

  if (!showType && !languageText && !full && !today) return null

  return (
    <div className={clsx('flex flex-wrap items-center gap-1', className)}>
      {showType && <Chip color="primary">{typeLabel}</Chip>}
      {languageText && <Chip color="secondary">{languageText}</Chip>}
      {full && <Chip color="neutral">{t('display.chip_full')}</Chip>}
      {today && <Chip color="contrast">{t('display.chip_today')}</Chip>}
    </div>
  )
}
