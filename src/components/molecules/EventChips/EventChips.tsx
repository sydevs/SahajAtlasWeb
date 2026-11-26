import type { EventDisplayStrings, EventSurface } from '@/hooks/use-event-display'

import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { Chip } from '@/components/atoms/Chip'
import { useLocale } from '@/hooks/use-locale'

export type EventChipsProps = {
  /** The parent's `useEventDisplay(event)`, shared with its EventFacts so a card resolves once. */
  strings: EventDisplayStrings
  languages: string[]
  /** The class page names every language; a card leaves out the viewer's own. */
  surface?: EventSurface
  className?: string
}

/**
 * The event's triage chips, all `flat`: the type (primary), the language(s) folded into one
 * chip (secondary), and "Today" (contrast). Which of
 * them show is `surfaceView`'s decision; this only renders it. The list card and the class page
 * share this component, so the two never drift.
 */
export function EventChips({ strings, languages, surface = 'page', className }: EventChipsProps) {
  const { t } = useTranslation()
  const { languageCode: uiLanguage, languageLabel } = useLocale()
  const { type, today } = strings.surfaces[surface]

  const shown =
    surface === 'card' ? languages.filter((code) => code.split('-')[0] !== uiLanguage) : languages
  const languageText = shown.length ? shown.map((code) => languageLabel(code)).join(', ') : null

  if (!type && !languageText && !today) return null

  return (
    <div className={clsx('flex flex-wrap items-center gap-1', className)}>
      {type && <Chip color="primary">{type}</Chip>}
      {languageText && <Chip color="secondary">{languageText}</Chip>}
      {today && <Chip color="contrast">{t('event.display.chip_today')}</Chip>}
    </div>
  )
}
