import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { Chip } from '@/components/atoms/Chip'
import { useEventDisplay, type DisplayableEvent } from '@/hooks/use-event-display'
import { useLocale } from '@/hooks/use-locale'

/** Whether a title already names this language, as in "Meditation in English". A whole-word
 *  match, so "German" does not match "Germany". */
const titleNames = (title: string | null | undefined, language: string): boolean => {
  const escaped = language.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  return new RegExp(`(^|[^\\p{L}])${escaped}($|[^\\p{L}])`, 'iu').test(title ?? '')
}

export type EventChipsVariant = 'default' | 'compact'

export type EventChipsProps = {
  event: DisplayableEvent & { languages: string[]; title?: string | null }
  /**
   * `default`, the class page, names the type and the languages, except where the page
   * already says so nearby.
   * `compact`, the list card, shows only what the rest of the card does not
   * already say. So it drops a recurring class's type (the card reads "Every
   * Tuesday"), the viewer's own language, and a language the title already names.
   */
  variant?: EventChipsVariant
  className?: string
}

/**
 * The event's triage chips. Up to two: the class type and the language(s) combined into one
 * chip, plus "Full" when it applies. All are neutral. "Today" is no chip: the class page says it
 * in the when line, and the list card in its facts. The list card and the event header share this component, so the two never
 * drift. `compact` trims the redundant chips on the card.
 */
export function EventChips({ event, variant = 'default', className }: EventChipsProps) {
  const { t } = useTranslation()
  const { languageCode: uiLanguage, languageLabel } = useLocale()
  const { display, typeLabel, recurrenceLine } = useEventDisplay(event)

  const compact = variant === 'compact'

  // Type: `compact` skips any recurring class, whose "Weekly class" only restates the
  // "Every Tuesday" right above it. On the class page, "Every Tuesday" right above says the
  // same. A course keeps its chip, because the when line does not say "course".
  const repeatsWhenLine = display.kind === 'class' && Boolean(recurrenceLine)
  // A by-request listing has no schedule, so it derives as a one-off, which is simply wrong.
  // "Contact host for timings" already says what it is.
  const byRequest = display.status === 'inactive' && display.kind === 'oneoff'
  const showType = !byRequest && (compact ? display.kind !== 'class' : !repeatsWhenLine)

  // All languages fold into a single chip. `compact` keeps only the ones that
  // differ from the viewer's UI language and that the title does not name.
  const languages = compact
    ? event.languages.filter(
        (code) =>
          code.split('-')[0] !== uiLanguage && !titleNames(event.title, languageLabel(code)),
      )
    : event.languages.filter((code) => !titleNames(event.title, languageLabel(code)))
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

  if (!showType && !languageText && !full) return null

  return (
    <div
      className={clsx('flex flex-wrap items-center gap-1', className)}
      data-sheet-fold={compact ? undefined : ''}
    >
      {showType && <Chip>{typeLabel}</Chip>}
      {languageText && <Chip>{languageText}</Chip>}
      {full && <Chip>{t('event.display.chip_full')}</Chip>}
    </div>
  )
}
