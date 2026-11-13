import type { DisplayableEvent } from '@/hooks/use-event-display'

import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'

import { Alert } from '@/components/atoms/Alert'
import { Button } from '@/components/atoms/Button'
import { Link } from '@/components/atoms/Link'
import { composeCalendarLine, useEventDisplay } from '@/hooks/use-event-display'

/** A listed class a new listing may duplicate, as the view found it in the feed. */
export type DuplicateClass = {
  id: number
  title: string
  /** The class's own page. */
  path: string
  /** The feed event, for the timing line. */
  event: DisplayableEvent
}

export type DuplicateNoticeProps = {
  classes: DuplicateClass[]
  /** The sender says the new class is none of `ids`, the classes on screen. */
  onDistinct: (ids: number[]) => void
}

// Enough to recognise one's own class without burying Send. A sender answers for the classes shown
// only, so a longer list shows its rest after each answer.
const SHOWN = 3

/**
 * "Is this class already listed?" — on Check, when a class at about the same place already meets
 * at the same time (`possibleDuplicates`). It names each one with a link to its page, and takes
 * "It's a different class" as an answer. A suggestion, not a stop: Send stays available.
 */
export function DuplicateNotice({ classes, onDistinct }: DuplicateNoticeProps) {
  const { t } = useTranslation()

  if (classes.length === 0) return null

  const shown = classes.slice(0, SHOWN)

  return (
    <Alert
      align="start"
      color="neutral"
      description={t('submit.duplicate.body')}
      title={t('submit.duplicate.title')}
    >
      <ul className="mt-3 flex flex-col gap-1.5">
        {shown.map((listed) => (
          <li key={listed.id}>
            <DuplicateRow listed={listed} />
          </li>
        ))}
      </ul>
      <Button
        className="mt-3"
        color="primary"
        size="sm"
        variant="flat"
        onClick={() => onDistinct(shown.map(({ id }) => id))}
      >
        {t('submit.duplicate.distinct')}
      </Button>
    </Alert>
  )
}

/** One listed class: its name, and when it meets — the reason it is named. */
function DuplicateRow({ listed }: { listed: DuplicateClass }) {
  const { display, recurrenceLine, whenLine, eventStartTime } = useEventDisplay(listed.event)
  // The same timing line its card in a list shows, so the two read alike.
  const timing = composeCalendarLine({
    recurrenceLine,
    whenLine,
    time: eventStartTime,
    hasNext: Boolean(display.next),
  })

  return (
    <Link
      className="flex w-full items-center justify-between gap-2 rounded bg-background px-3 py-2 text-foreground"
      href={listed.path}
    >
      <span className="flex min-w-0 flex-col">
        <span className="line-clamp-2 text-sm font-medium">{listed.title}</span>
        {timing && <span className="text-xs text-gray-11">{timing}</span>}
      </span>
      <ChevronRight aria-hidden className="shrink-0 text-gray-9 rtl:-scale-x-100" size={18} />
    </Link>
  )
}
