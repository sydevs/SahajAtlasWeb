import { useSuspenseQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router'
import { useEffect, lazy } from 'react'
import { Helmet } from 'react-helmet-async'

import api from '@/config/api'
import { Link } from '@/components/atoms/Link'
import { EventMetadata, Panel } from '@/components/molecules'
import { useViewState } from '@/config/store'
import { UpArrowIcon } from '@/components/atoms'
import { useMapbox } from '@/hooks/use-mapbox'
import { isCanonicalPath, isOnline, parentOf } from '@/lib/shape'

const EventViewContent = lazy(() =>
  import('@/components/organisms/EventView').then((m) => ({ default: m.EventView })),
)

function EventPanel({ eventId }: { eventId: number }) {
  const { mapbox, moveMap } = useMapbox()
  const navigate = useNavigate()
  const location = useLocation()
  const setMapSelection = useViewState((s) => s.setSelection)
  const { data: event } = useSuspenseQuery({
    queryKey: ['event', eventId],
    queryFn: () => api.getEvent(Number(eventId)),
  })

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  // Canonicalize to the event's nested breadcrumb path (also subsumes /events/:id).
  useEffect(() => {
    if (event.path && !isCanonicalPath(location.pathname, event.path)) {
      navigate(event.path, { replace: true })
    }
  }, [event.path, location.pathname, navigate])

  useEffect(() => {
    if (!mapbox) return

    const { latitude, longitude } = event.address ?? {}
    const online = isOnline(event)

    if (latitude != null && longitude != null) {
      setMapSelection({ latitude, longitude, approximate: online })
      moveMap({ center: [longitude, latitude], zoom: online ? 7 : 15 })
    }

    return () => {
      setMapSelection(null)
    }
  }, [event, mapbox])

  // Back-button target: the event's region (city/center) page — drop the trailing id.
  const parentPath = parentOf(event.path) ?? '/search'

  return (
    <>
      {event.webUrl && (
        <Helmet>
          <link href={event.webUrl} rel="canonical" />
          <meta content={event.webUrl} property="og:url" />
        </Helmet>
      )}
      <Link
        className="text-3xl absolute top-5 left-2.5 z-20 bg-background rounded hover:opacity-100 hover:bg-primary-3 transition-colors"
        href={parentPath}
      >
        <UpArrowIcon className="text-lg" size={32} />
      </Link>
      <EventMetadata event={event} />
      <EventViewContent event={event} />
    </>
  )
}

export default function EventPage({ id }: { id: number }) {
  // This wrapper is necessary because <Panel> contains an <ErrorBoundary> and <Suspense> to handle loading
  return (
    <Panel mapWindow={180} width={467}>
      <EventPanel eventId={id} />
    </Panel>
  )
}
