import { useTranslation } from 'react-i18next'

import { DrawerBody } from '@/components/atoms/Drawer'
import { EventFacts, FallbackPanel } from '@/components/molecules'
// This imports the leaf path, not the barrel. ShareContent owns react-share, and eager views
// import the barrel — so a re-export there would keep react-share in the eager graph, even
// though this view itself is lazy (issue #96). EventDetails reaches EventActions the same way,
// for the same reason.
import { ShareContent } from '@/components/molecules/ShareContent'
import { QrPoster } from '@/components/molecules/QrPoster'
import { useMapController } from '@/hooks/use-map-controller'
import { useShareUrl } from '@/hooks/use-share-url'
import { useViewerCountry } from '@/hooks/use-viewer-country'
import { NavHeader } from '@/views/nav'
import { useDrawerControl, useEventFromPath, useFrameOnTop } from '@/views/shared'

// Share links for an event, at route `<event-path>/share`. The event's Share CTA reaches
// this view, and the route is deep-linkable. So it repeats the compact resolver summary —
// title, chips, when, where — above the share block. A direct-link visitor then sees what
// they are sharing, without any other Atlas chrome (issue #52).
export function ShareView({ eventPath }: { eventPath: string }) {
  const { t } = useTranslation()
  const { frameEvent } = useMapController()
  const { expand } = useDrawerControl()
  // Order the share targets to the viewer's region. This is resolved here, so ShareContent
  // stays a pure, prop-driven molecule.
  const country = useViewerCountry()

  const { data: event } = useEventFromPath(eventPath)
  // This resolves to the event's canonical page. Otherwise it resolves to this session's own
  // address, if the route is part of it. It resolves to nothing on a host page where the
  // widget routes off the URL (issue #115).
  const url = useShareUrl(event.webUrl, event.path)

  useFrameOnTop(({ isEntry }) => frameEvent(event, { isEntry }), [event, frameEvent])

  return (
    <>
      <NavHeader subtitle={event.title} title={t('share.title_class')} />
      <DrawerBody className="p-4">
        {/* Match the summary card's width so the share block lines up with it. */}
        <div className="mx-auto w-full max-w-md">
          {url ? (
            <div className="flex flex-col gap-4">
              <ShareContent country={country} label={event.title} url={url} />
              <QrPoster label={event.title} url={url} onOpen={expand} />
            </div>
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
        {/* The buttons come first, so they fit the sheet's usual height with the map still in view.
            The class's name is in the header. Its time and place follow for a direct-link visitor. */}
        <EventFacts className="mx-auto mt-4 w-full max-w-md" event={event} variant="card" />
      </DrawerBody>
    </>
  )
}
