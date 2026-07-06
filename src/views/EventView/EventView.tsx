import { type ReactNode, Suspense, lazy, useEffect } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'

import { DrawerBody, DrawerContent } from '@/components/atoms/Drawer'
import { EventMetadata } from '@/components/molecules'
import { Spinner } from '@/components/atoms/Spinner'
import api from '@/config/api'
import { useMapController } from '@/hooks/use-map-controller'
import { useWidgetMode } from '@/config/mode'
import { BackButton, ViewFooter, useFrameOnTop } from '@/views/shared'

// EventDetails pulls in DOMPurify + the detail cards; keep it out of the main
// chunk (as pages/event.tsx used to) by lazy-loading it here.
const EventDetails = lazy(() =>
  import('@/components/organisms/EventDetails').then((m) => ({ default: m.EventDetails })),
)

// A single event (route `<event-path>`). No header — the drawer is the chrome —
// so a floating back control returns up the stack. Frames + selects the event on
// the map when it's the top of the stack, and clears the selection on unmount.
export function EventView({
  id,
  basePath,
  parentPath,
  isTop,
  children,
}: {
  id: number
  basePath: string
  parentPath: string
  isTop: boolean
  children?: ReactNode
}) {
  const { standalone } = useWidgetMode()
  const { frameEvent, clearSelection } = useMapController()

  const { data: event } = useSuspenseQuery({
    queryKey: ['event', id],
    queryFn: () => api.getEvent(id),
  })

  useFrameOnTop(isTop, () => frameEvent(event), [event, frameEvent])

  useEffect(() => () => clearSelection(), [clearSelection])

  return (
    <DrawerContent ariaLabel={event.title}>
      {/* SEO (title, canonical, JSON-LD) is only meaningful for the crawlable
          standalone build; the embedded widget's host owns the document head. */}
      {standalone && <EventMetadata event={event} />}
      <BackButton className="absolute left-2 top-2 z-10 bg-background/80" to={parentPath} />
      <DrawerBody className="px-0 pt-0">
        <Suspense fallback={<Spinner className="mx-auto my-16" />}>
          <EventDetails basePath={basePath} event={event} />
        </Suspense>
      </DrawerBody>
      <ViewFooter />
      {children}
    </DrawerContent>
  )
}
