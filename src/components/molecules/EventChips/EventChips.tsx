import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { Chip } from '@/components/atoms/Chip'
import { useEventDisplay, type DisplayableEvent } from '@/hooks/use-event-display'
import { useLocale } from '@/hooks/use-locale'

export type EventChipsVariant = 'default' | 'concise'

export type EventChipsProps = {
  event: DisplayableEvent & { languages: string[] }
  /**
   * `default` (event header) names the type and every language; `concise` (the
   * compact list card) drops the plain weekly-class type and the viewer's own
   * language — the chips that add nothing at a glance.
   */
  variant?: EventChipsVariant
  className?: string
}

/**
 * The event's triage chips — up to three, all `flat`: the class type (primary),
 * the language(s) combined into one chip (secondary), and a "Today" chip
 * (danger) when the next session is today. Shared by the list card and the event
 * header so the two never drift; `concise` trims the redundant chips on the card.
 */
export function EventChips({ event, variant = 'default', className }: EventChipsProps) {
  const { t } = useTranslation('events')
  const { languageCode: uiLanguage, languageLabel } = useLocale()
  const { display, typeLabel, isDefaultType } = useEventDisplay(event)

  const concise = variant === 'concise'

  // Type: always named in `default`; `concise` skips the plain weekly class,
  // whose label adds nothing on a compact card.
  const showType = !concise || !isDefaultType

  // All languages fold into a single chip; `concise` keeps only the ones that
  // differ from the viewer's UI language.
  const languages = concise
    ? event.languages.filter((code) => code.split('-')[0] !== uiLanguage)
    : event.languages
  const languageText = languages.length
    ? languages.map((code) => languageLabel(code)).join(', ')
    : null

  const today = display.status === 'today'

  if (!showType && !languageText && !today) return null

  return (
    <div className={clsx('flex flex-wrap items-center gap-1', className)}>
      {showType && <Chip color="primary">{typeLabel}</Chip>}
      {languageText && <Chip color="secondary">{languageText}</Chip>}
      {today && <Chip color="contrast">{t('display.chip_today')}</Chip>}
    </div>
  )
}
