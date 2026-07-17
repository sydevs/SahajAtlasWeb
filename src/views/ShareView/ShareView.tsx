import { useTranslation } from 'react-i18next'

import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { ShareContent } from '@/components/molecules'
import { useMapController } from '@/hooks/use-map-controller'
import { CloseButton, EventSummary, useEventFromPath, useFrameOnTop } from '@/views/shared'

// Share links for an event (route `<event-path>/share`). Reached by the event's
// Share CTA and deep-linkable — so it repeats the compact resolver summary
// (title · chips · when · where) above the share block: a direct-link visitor
// sees what they're sharing without any other Atlas chrome (issue #52).
export function ShareView({ eventPath }: { eventPath: string }) {
  const { t } = useTranslation('events')
  const { frameEvent } = useMapController()

  const { data: event } = useEventFromPath(eventPath)

  useFrameOnTop(() => frameEvent(event), [event, frameEvent])

  return (
    <>
      <DrawerHeader className="justify-between">
        <div className="min-w-0 truncate text-lg font-bold">{t('details.share_meditation')}</div>
        <CloseButton />
      </DrawerHeader>
      <DrawerBody className="p-4">
        <EventSummary event={event} />
        {/* A null webUrl (unpublished canonical) falls back to the current URL
            so the copy field / share links never carry an empty string. */}
        <ShareContent label={event.title} url={event.webUrl ?? window.location.href} />
      </DrawerBody>
    </>
  )
}
