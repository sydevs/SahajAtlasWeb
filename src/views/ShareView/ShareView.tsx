import { useTranslation } from 'react-i18next'

import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { EventSummary, FallbackPanel } from '@/components/molecules'
// Leaf path, not the barrel: ShareContent owns react-share, and the barrel is imported by
// eager views — so a re-export there is enough to keep it in the eager graph even though
// this view is lazy (issue #96). Same reason EventDetails reaches EventActions this way.
import { ShareContent } from '@/components/molecules/ShareContent'
import { useMapController } from '@/hooks/use-map-controller'
import { useShareUrl } from '@/hooks/use-share-url'
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
  // The event's canonical page, else this session's address if the route is in it — and
  // nothing at all on a host page the widget routes off-URL on (issue #115).
  const url = useShareUrl(event.webUrl)

  useFrameOnTop(({ isEntry }) => frameEvent(event, { isEntry }), [event, frameEvent])

  return (
    <>
      <DrawerHeader className="justify-between">
        <DrawerTitle title={t('details.share_meditation')} />
        <CloseButton />
      </DrawerHeader>
      <DrawerBody className="p-4">
        <EventSummary event={event} />
        {/* Match the summary card's width so the share block lines up with it. */}
        <div className="mx-auto w-full max-w-md">
          {url ? (
            <ShareContent country={country} label={event.title} url={url} />
          ) : (
            /* No canonical page AND no route in the URL — the copy field, the native
               sheet and every react-share target all need a URL, and the only string
               within reach is the HOST page's, which names their article and not this
               meditation. So this screen says so instead of handing out a link that goes
               somewhere else (issue #115). The `unavailable` register is the right one:
               the class is real, this just can't be done from here — and it leads with the
               organiser's number when the event carries one, which is the one way to pass
               the class on that doesn't need a URL. */
            <FallbackPanel
              contact={
                event.contactPhone
                  ? { phone: event.contactPhone, name: event.contactName }
                  : undefined
              }
              kind="unavailable"
              message={t('details.share_unavailable')}
            />
          )}
        </div>
      </DrawerBody>
    </>
  )
}
