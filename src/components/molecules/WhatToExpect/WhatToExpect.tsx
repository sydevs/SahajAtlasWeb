import { useTranslation } from 'react-i18next'

import { useEventDisplay } from '@/hooks/use-event-display'
import { lexicalToHtml } from '@/lib/shape'
import { Event } from '@/types'

// Below this, the host's own text says too little to reassure a newcomer.
const THIN_DESCRIPTION_CHARS = 200

const plainText = (html: string): string => html.replace(/<[^>]*>/g, ' ').trim()

export type WhatToExpectProps = {
  event: Event
}

/**
 * A short reassurance for a newcomer, shown only where the host wrote little and didn't already
 * mention beginners. App-supplied, never host-authored. It is skipped for a course past its
 * first session, a full class and anything finished or by request.
 */
export function WhatToExpect({ event }: WhatToExpectProps) {
  const { t } = useTranslation()
  const { display } = useEventDisplay(event)
  const description = plainText(lexicalToHtml(event.description) ?? '')

  if (display.registration !== 'open') return null
  if (description.length >= THIN_DESCRIPTION_CHARS || /beginner/i.test(description)) return null

  return (
    <div className="mt-4 flex flex-col gap-2">
      <h2 className="text-lg">{t('event.display.expect_title')}</h2>
      <p className="text-base text-gray-11">{t('event.display.expect_beginners')}</p>
    </div>
  )
}
