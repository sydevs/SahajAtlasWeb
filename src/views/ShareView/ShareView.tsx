import { type ReactNode, useEffect } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { DrawerBody, DrawerContent, DrawerFooter, DrawerHeader } from '@/components/atoms/Drawer'
import { ShareContent } from '@/components/molecules'
import { Toolbar } from '@/components/molecules/Toolbar'
import api from '@/config/api'
import { useMapController } from '@/hooks/use-map-controller'
import { resolvePath } from '@/lib/shape'
import { BackButton } from '@/views/shared'

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

  const resolved = resolvePath(eventPath)
  const id = resolved?.kind === 'event' ? resolved.id : NaN

  const { data: event } = useSuspenseQuery({
    queryKey: ['event', id],
    queryFn: () => api.getEvent(id),
  })

  useEffect(() => {
    if (isTop) frameEvent(event)
  }, [isTop, event, frameEvent])

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
      <DrawerFooter>
        <Toolbar />
      </DrawerFooter>
      {children}
    </DrawerContent>
  )
}
