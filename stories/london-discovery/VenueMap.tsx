import type { Venue } from './fixtures'

import { useEffect, useRef, useState } from 'react'
import ReactMapGL, { Marker, NavigationControl, type MapRef } from 'react-map-gl/mapbox'
import { MapPin, Map as MapIcon, Maximize2 } from 'lucide-react'

import { useTheme } from '@/hooks/use-theme'

const styles = {
  light: 'sydevadmin/ck7g6nag70rn11io09f45odkq',
  dark: 'sydevadmin/cl4nw934f001j14l8jnof3a7w',
}
const token = import.meta.env.VITE_MAPBOX_ACCESSTOKEN

// Bake the matching pins into one static image so a swipe scrolls the discovery page.
export function VenueMapThumbnail({ venues, extent }: { venues: Venue[]; extent: Venue[] }) {
  const { theme } = useTheme()
  const [failed, setFailed] = useState('')
  const point = (v: Venue) => v.longitude.toFixed(5) + ',' + v.latitude.toFixed(5)
  const pins = venues.map((v) => 'pin-s+176b70(' + point(v) + ')').join(',')
  const { west, east, south, north } = boundsOf(extent)
  const at =
    extent.length === 1
      ? point(extent[0]) + ',14.5'
      : pins
        ? 'auto'
        : `[${west},${south},${east},${north}]`
  const url = `https://api.mapbox.com/styles/v1/${styles[theme]}/static/${pins ? pins + '/' : ''}${at}/440x176@2x?access_token=${encodeURIComponent(token ?? '')}${extent.length > 1 ? '&padding=20' : ''}`
  const available = token && failed !== url

  return (
    <>
      {available ? (
        <img
          key={url}
          alt=""
          className="pointer-events-none block size-full object-cover"
          draggable={false}
          src={url}
          onError={() => setFailed(url)}
          onLoad={() => setFailed('')}
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-primary-11">
          <MapIcon aria-hidden size={20} /> View venues on map
        </span>
      )}
      {available && (
        <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded bg-background/80 px-1.5 py-0.5 text-xs font-normal text-gray-11">
          <Maximize2 aria-hidden size={12} strokeWidth={1.5} /> Tap to expand
        </span>
      )}
    </>
  )
}

type MapProps = {
  venues: Venue[]
  selectedId: string | null
  onSelect: (id: string) => void
}

function Pin({
  venue,
  active,
  onSelect,
}: {
  venue: Venue
  active: boolean
  onSelect: MapProps['onSelect']
}) {
  return (
    <button
      aria-label={`Show ${venue.name} in ${venue.area}`}
      aria-pressed={active}
      className="group relative flex size-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-primary"
      title={venue.name}
      type="button"
      onClick={() => onSelect(venue.id)}
    >
      <MapPin
        aria-hidden
        className={
          active
            ? 'fill-[#a9442b] text-white drop-shadow-md'
            : 'fill-[#176b70] text-white drop-shadow-sm group-hover:fill-[#124e52]'
        }
        size={active ? 39 : 32}
        strokeWidth={1.8}
      />
      {active && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-full left-1/2 -mb-1 -translate-x-1/2 rounded bg-white px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-[#223334] shadow-sm"
        >
          {venue.area}
        </span>
      )}
    </button>
  )
}

// A static city overview still works without WebGL. The image and HTML buttons use the
// same Web Mercator camera, so selecting a place stays possible in the iPhone frame too.
type Bounds = { west: number; east: number; north: number; south: number }
function boundsOf(venues: Venue[]): Bounds {
  const longitudes = venues.map((venue) => venue.longitude)
  const latitudes = venues.map((venue) => venue.latitude)

  return {
    west: Math.min(...longitudes),
    east: Math.max(...longitudes),
    south: Math.min(...latitudes),
    north: Math.max(...latitudes),
  }
}

const mercatorY = (latitude: number) =>
  -Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360)) / (2 * Math.PI)

function StaticOverview({
  venues,
  selectedId,
  onSelect,
  west,
  east,
  north,
  south,
}: MapProps & Bounds) {
  const { theme } = useTheme()
  const [unavailable, setUnavailable] = useState(!token)

  const stage = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    if (!stage.current || unavailable) return
    const observer = new ResizeObserver(([{ contentRect }]) => {
      const scale = Math.min(1, 1280 / Math.max(contentRect.width, contentRect.height))

      setSize({
        width: Math.round(contentRect.width * scale),
        height: Math.round(contentRect.height * scale),
      })
    })

    observer.observe(stage.current)

    return () => observer.disconnect()
  }, [unavailable])

  if (unavailable)
    return (
      <div className="flex h-full flex-col justify-center overflow-y-auto bg-gray-2 p-5">
        <p className="mb-2 text-sm font-medium text-gray-11">Street map unavailable</p>
        <ul className="flex flex-col gap-1">
          {venues.map((venue) => (
            <li key={venue.id}>
              <button
                aria-pressed={venue.id === selectedId}
                className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-start hover:bg-gray-3 aria-pressed:bg-primary-3"
                type="button"
                onClick={() => onSelect(venue.id)}
              >
                <MapPin aria-hidden className="shrink-0 text-primary" size={18} />
                <span>
                  <strong>{venue.area}</strong>
                  <br />
                  {venue.street}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    )

  const { width, height } = size
  const midpointY = (mercatorY(north) + mercatorY(south)) / 2
  const latitude = (Math.atan(Math.sinh(-2 * Math.PI * midpointY)) * 180) / Math.PI
  const longitude = (east + west) / 2
  const pxPerWorld = Math.min(
    Math.max(1, width - 100) / ((east - west) / 360),
    Math.max(1, height - 120) / (mercatorY(south) - mercatorY(north)),
  )
  const zoom = Number(Math.min(13, Math.max(0, Math.log2(pxPerWorld / 512))).toFixed(2))
  const worldPixels = 512 * 2 ** zoom
  const url = `https://api.mapbox.com/styles/v1/${styles[theme]}/static/${longitude.toFixed(6)},${latitude.toFixed(6)},${zoom}/${width}x${height}@2x?access_token=${encodeURIComponent(token)}`

  return (
    <div ref={stage} className="relative size-full overflow-hidden bg-gray-2">
      {width > 0 && height > 0 && (
        <>
          <img
            alt="Street map of class venues"
            className="block size-full"
            src={url}
            onError={() => setUnavailable(true)}
          />
          {venues.map((venue) => (
            <div
              key={venue.id}
              className="absolute -translate-x-1/2 -translate-y-full"
              style={{
                left: `${50 + (100 * (venue.longitude - longitude) * worldPixels) / (360 * width)}%`,
                top: `${50 + (100 * (mercatorY(venue.latitude) - midpointY) * worldPixels) / height}%`,
                zIndex: venue.id === selectedId ? 2 : 1,
              }}
            >
              <Pin active={venue.id === selectedId} venue={venue} onSelect={onSelect} />
            </div>
          ))}
        </>
      )}
    </div>
  )
}

export type ExploredCamera = { center: [number, number]; zoom: number }

export function VenueMap({
  venues,
  selectedId,
  onSelect,
  camera,
  extent,
}: MapProps & { extent: Venue[]; camera: React.RefObject<ExploredCamera | null> }) {
  const { theme } = useTheme()
  const ref = useRef<MapRef>(null)
  const [ready, setReady] = useState(false)
  const [fallback, setFallback] = useState(!token)
  const { west, east, south, north } = boundsOf(extent)

  useEffect(() => {
    const map = ref.current

    if (!ready || !map || fallback) return
    const frame = () => {
      map.resize()
      if (camera.current) {
        map.jumpTo(camera.current)

        return
      }
      if (west === east && south === north) {
        map.jumpTo({ center: [west, south], zoom: 13 })

        return
      }
      map.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        { padding: 55, maxZoom: 13, duration: 0 },
      )
    }
    const observer = new ResizeObserver(frame)

    observer.observe(map.getContainer())

    return () => observer.disconnect()
  }, [ready, fallback, west, east, south, north, camera])

  useEffect(() => {
    if (ready || fallback) return
    const timer = window.setTimeout(() => setFallback(true), 12000)

    return () => window.clearTimeout(timer)
  }, [ready, fallback])

  if (fallback)
    return (
      <StaticOverview
        east={east}
        north={north}
        selectedId={selectedId}
        south={south}
        venues={venues}
        west={west}
        onSelect={onSelect}
      />
    )

  return (
    <ReactMapGL
      ref={ref}
      reuseMaps
      aria-label="Map of meditation venues"
      dragRotate={false}
      initialViewState={
        west === east && south === north
          ? { longitude: west, latitude: south, zoom: 13 }
          : {
              bounds: [
                [west, south],
                [east, north],
              ],
              fitBoundsOptions: { padding: 55, maxZoom: 13 },
            }
      }
      mapStyle={'mapbox://styles/' + styles[theme]}
      mapboxAccessToken={token}
      touchPitch={false}
      onError={() => setFallback(true)}
      onLoad={() => setReady(true)}
      onMoveEnd={({ originalEvent, viewState }) => {
        if (originalEvent)
          camera.current = {
            center: [viewState.longitude, viewState.latitude],
            zoom: viewState.zoom,
          }
      }}
    >
      <NavigationControl position="top-right" showCompass={false} />
      {venues.map((venue) => (
        <Marker
          key={venue.id}
          anchor="bottom"
          latitude={venue.latitude}
          longitude={venue.longitude}
          style={{ zIndex: venue.id === selectedId ? 2 : 1 }}
        >
          <Pin active={venue.id === selectedId} venue={venue} onSelect={onSelect} />
        </Marker>
      ))}
    </ReactMapGL>
  )
}
