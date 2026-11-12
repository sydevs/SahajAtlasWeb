import { useTranslation } from 'react-i18next'

import { DrawerBody } from '@/components/atoms/Drawer'
import { EventSummary, FallbackPanel } from '@/components/molecules'
// This imports the leaf path, not the barrel. ShareContent owns react-share, and eager views
// import the barrel — so a re-export there would keep react-share in the eager graph, even
// though this view itself is lazy (issue #96). EventDetails reaches EventActions the same way,
// for the same reason.
import { ShareContent } from '@/components/molecules/ShareContent'
import { useListingTitle } from '@/hooks/use-event-display'
import { useShareUrl } from '@/hooks/use-share-url'
import { useViewerCountry } from '@/hooks/use-viewer-country'
import { NavHeader } from '@/views/nav'
import { useDrawerControl, useEventFromPath, useFrameEventOnTop } from '@/views/shared'

// Share links for an event, at route `<event-path>/share`. The event's Share CTA reaches
// this view, and the route is deep-linkable. So it opens on the class's summary — the same one
// its list card shows, and the registration panels lead with — above the share block. A
// direct-link visitor then sees what they are sharing, without any other Atlas chrome (issue #52).
export function ShareView({ eventPath }: { eventPath: string }) {
  const { t } = useTranslation()
  const { expand } = useDrawerControl()
  // Order the share targets to the viewer's region. This is resolved here, so ShareContent
  // stays a pure, prop-driven molecule.
  const country = useViewerCountry()

  const { data: event } = useEventFromPath(eventPath)
  // This resolves to the event's canonical page. Otherwise it resolves to this session's own
  // address, if the route is part of it. It resolves to nothing on a host page where the
  // widget routes off the URL (issue #115).
  const url = useShareUrl(event.webUrl, event.path)
  // What the share sheet, the networks and the QR poster name it: an inactive listing by its town.
  const title = useListingTitle(event)

  useFrameEventOnTop(event)

  return (
    <>
      <NavHeader title={t('share.title_class')} />
      <DrawerBody className="px-gutter py-4">
        <div className="mx-auto flex w-full max-w-md flex-col gap-4">
          <EventSummary boxed event={event} />
          {url ? (
            <ShareContent qr country={country} label={title} url={url} onQrOpen={expand} />
          ) : (
            /* No canonical page, and no route in the URL. The copy field, the native sheet,
               and every react-share target all need a URL. The only string within reach is
               the HOST page's, and that names their article, not this meditation. So this
               screen says so, instead of handing out a link that goes somewhere else (issue
               #115). `align="start"` matches the identical panel on the sibling register
               route, which shares this recovery instead of growing a second copy of it. */
            <FallbackPanel
              align="start"
              contact={
                event.contactPhone
                  ? { phone: event.contactPhone, name: event.contactName }
                  : undefined
              }
              kind="share-unavailable"
            />
          )}
        </div>
      </DrawerBody>
    </>
  )
}
