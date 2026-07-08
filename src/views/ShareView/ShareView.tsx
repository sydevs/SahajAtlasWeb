import { useTranslation } from 'react-i18next'

import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { ShareContent } from '@/components/molecules'
import { useMapController } from '@/hooks/use-map-controller'
import { CloseButton, useEventFromPath, useFrameOnTop } from '@/views/shared'

// Share links for an event (route `<event-path>/share`). Reached by the event's
// Share CTA and deep-linkable. Closing returns to the event.
export function ShareView({ eventPath, isTop }: { eventPath: string; isTop: boolean }) {
  const { t } = useTranslation('events')
  const { frameEvent } = useMapController()

  const { data: event } = useEventFromPath(eventPath)

  useFrameOnTop(isTop, () => frameEvent(event), [event, frameEvent])

  return (
    <>
      <DrawerHeader className="justify-between">
        <div className="min-w-0 truncate text-lg font-bold">{t('details.share_meditation')}</div>
        <CloseButton />
      </DrawerHeader>
      <DrawerBody className="p-4">
        <ShareContent label={event.title} url={event.webUrl ?? ''} />
      </DrawerBody>
    </>
  )
}
