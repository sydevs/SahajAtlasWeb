import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { Chip } from '@/components/atoms/Chip'
import {
  useEventDisplay,
  type DisplayableEvent,
  type EventSurface,
} from '@/hooks/use-event-display'
import { useLocale } from '@/hooks/use-locale'

export type EventChipsProps = {
  event: DisplayableEvent & { languages: string[] }
  /** The class page names every language; a card leaves out the viewer's own. */
  surface?: Exclude<EventSurface, 'summary'>
  className?: string
}

/**
 * The event's triage chips, all `flat`: the type (primary), the language(s) folded into one
 * chip (secondary), and the availability chip, "Full" (neutral) or "Today" (contrast). Which of
 * them show is `surfaceView`'s decision; this only renders it. The list card and the class page
 * share this component, so the two never drift.
 */
export function EventChips({ event, surface = 'page', className }: EventChipsProps) {
  const { t } = useTranslation()
  const { languageCode: uiLanguage, languageLabel } = useLocale()
  const { type, availability } = useEventDisplay(event).surfaces[surface]

  const languages =
    surface === 'card'
      ? event.languages.filter((code) => code.split('-')[0] !== uiLanguage)
      : event.languages
  const languageText = languages.length
    ? languages.map((code) => languageLabel(code)).join(', ')
    : null

  if (!type && !languageText && !availability) return null

  return (
    <div className={clsx('flex flex-wrap items-center gap-1', className)}>
      {type && <Chip color="primary">{type}</Chip>}
      {languageText && <Chip color="secondary">{languageText}</Chip>}
      {availability === 'full' && <Chip color="neutral">{t('event.display.chip_full')}</Chip>}
      {availability === 'today' && <Chip color="contrast">{t('event.display.chip_today')}</Chip>}
    </div>
  )
}
