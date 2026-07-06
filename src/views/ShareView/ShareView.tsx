import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { DrawerBody, DrawerContent, DrawerHeader } from '@/components/atoms/Drawer'
import { ShareContent } from '@/components/molecules'
import { useMapController } from '@/hooks/use-map-controller'
import { BackButton, ViewFooter, useEventFromPath, useFrameOnTop } from '@/views/shared'

// Share links for an event (route `<event-path>/share`). Reached by the event's
// Share CTA and deep-linkable. Closing returns to the event.
export function ShareView({
  eventPath,
  parentPath,
  isTop,
  children,
}: {
  eventPath: string
  parentPath: string
  isTop: boolean
  children?: ReactNode
}) {
  const { t } = useTranslation('events')
  const { frameEvent } = useMapController()

  const { data: event } = useEventFromPath(eventPath)

  useFrameOnTop(isTop, () => frameEvent(event), [event, frameEvent])

  return (
    <DrawerContent ariaLabel={t('details.share')}>
      <DrawerHeader>
        <BackButton to={parentPath} />
        <div className="truncate text-lg font-bold">
          {t('details.share_event', { event: event.title })}
        </div>
      </DrawerHeader>
      <DrawerBody>
        <ShareContent label={event.title} url={event.webUrl ?? ''} />
      </DrawerBody>
      <ViewFooter />
      {children}
    </DrawerContent>
  )
}
