import { useTranslation } from 'react-i18next'

import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { EventSummary, ShareContent } from '@/components/molecules'
import { useMapController } from '@/hooks/use-map-controller'
import { useViewerCountry } from '@/hooks/use-viewer-country'
import { CloseButton, DrawerTitle, useEventFromPath, useFrameOnTop } from '@/views/shared'

// Share links for an event (route `<event-path>/share`). Reached by the event's
// Share CTA and deep-linkable — so it repeats the compact resolver summary
// (title · chips · when · where) above the share block: a direct-link visitor
// sees what they're sharing without any other Atlas chrome (issue #52).
export function ShareView({ eventPath }: { eventPath: string }) {
  const { t } = useTranslation('events')
  const { frameEvent } = useMapController()
  // Order the share targets to the viewer's region (resolved here so ShareContent
  // stays a pure, prop-driven molecule).
  const country = useViewerCountry()

  const { data: event } = useEventFromPath(eventPath)

  useFrameOnTop(({ isEntry }) => frameEvent(event, { isEntry }), [event, frameEvent])

  return (
    <>
      <DrawerHeader className="justify-between">
        <DrawerTitle title={t('details.share_meditation')} />
        <CloseButton />
      </DrawerHeader>
      <DrawerBody className="p-4">
        <EventSummary event={event} />
        {/* Match the summary card's width so the share block lines up with it. A null
            webUrl (an unpublished/gated event has no canonical link) falls back to the
            current deep link, so the copy field and native share never carry an empty
            URL — which the OS share sheet would resolve to the host page, not the event. */}
        <div className="mx-auto w-full max-w-md">
          <ShareContent
            country={country}
            label={event.title}
            url={event.webUrl ?? window.location.href}
          />
        </div>
      </DrawerBody>
    </>
  )
}
