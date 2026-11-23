import type { Event } from '@/types'

import { type ReactNode, useState, useCallback } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import ReactMapGL, { Marker, NavigationControl } from 'react-map-gl/mapbox'
import { Navigation, Maximize2, X } from 'lucide-react'

import { ClassAction } from './ClassActions'

import { Button } from '@/components/atoms/Button'
import { ModalBody, ModalContent } from '@/components/atoms/Modal'
import { useCoarsePointer } from '@/config/responsive'
import { useLocale } from '@/hooks/use-locale'
import { usePublishedNode } from '@/hooks/use-published-node'
import { useTheme } from '@/hooks/use-theme'
import { frameElement, setFrame, widgetOverlayContainer } from '@/lib/overlay'
import { hasApproximatePlace } from '@/lib/shape'

const mapStyles = {
  light: 'sydevadmin/ck7g6nag70rn11io09f45odkq',
  dark: 'sydevadmin/cl4nw934f001j14l8jnof3a7w',
}
const pin = 'e0775c'
const staticMapUrl = ({
  longitude,
  latitude,
  width,
  height,
  zoom = 15,
  token = import.meta.env.VITE_MAPBOX_ACCESSTOKEN,
}: {
  longitude: number
  latitude: number
  width: number
  height: number
  zoom?: number
  token?: string
}): string | null => {
  if (!token) return null

  const at = `${longitude.toFixed(5)},${latitude.toFixed(5)}`

  return (
    `https://api.mapbox.com/styles/v1/${mapStyles.light}/static/pin-l+${pin}(${at})/${at},${zoom},0/` +
    `${Math.round(width)}x${Math.round(height)}@2x?access_token=${encodeURIComponent(token)}`
  )
}

const googleRoute = (latitude: number, longitude: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`

// The story's iPhone frame has the desktop browser's user agent. Direct previews use the device.
function VenueDirections({
  latitude,
  longitude,
  compact = false,
}: {
  latitude: number
  longitude: number
  compact?: boolean
}) {
  const { t } = useLocale()
  const device = new URLSearchParams(window.location.search).get('device')
  const apple = device
    ? device === 'iPhone'
    : /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const destination = `${latitude},${longitude}`
  const google = googleRoute(latitude, longitude)
  const label = t('event.actions.directions')
  const buttonStyle = compact
    ? 'h-11 gap-1.5 rounded-full bg-background px-3 text-sm shadow-sm'
    : 'h-12 w-full'
  const content = (
    <>
      <Navigation aria-hidden size={17} />
      {label}
    </>
  )

  if (!apple)
    return (
      <Button
        className={buttonStyle}
        color="primary"
        href={google}
        target="_blank"
        variant={compact ? 'ghost' : 'bordered'}
      >
        {content}
      </Button>
    )

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button className={buttonStyle} color="primary" variant={compact ? 'ghost' : 'bordered'}>
          {content}
        </Button>
      </Dialog.Trigger>
      <ModalContent closeLabel={t('common.chrome.close')} title="Open directions in">
        <ModalBody className="flex flex-col gap-2 pb-4">
          <Button
            href={`https://maps.apple.com/?daddr=${destination}`}
            size="lg"
            target="_blank"
            variant="flat"
          >
            Apple Maps
          </Button>
          <Button href={google} size="lg" target="_blank" variant="flat">
            Google Maps
          </Button>
        </ModalBody>
      </ModalContent>
    </Dialog.Root>
  )
}

// Mounted inside the open dialog so nested contact, share and photo overlays stay in its focus trap.
function DesktopClassMap({ map, panel }: { map: ReactNode; panel: ReactNode }) {
  const [pageFrame] = useState(frameElement)
  const publish = useCallback(
    (node: HTMLDivElement | null) => setFrame(node ?? pageFrame),
    [pageFrame],
  )
  const { node, adopt } = usePublishedNode(publish)

  return (
    <Dialog.Content
      ref={adopt}
      aria-describedby={undefined}
      className="fixed inset-0 isolate z-50 overflow-clip bg-background text-foreground outline-none [&_.mapboxgl-ctrl-top-right]:top-4! [&_.mapboxgl-ctrl-top-right]:right-4! [&_.mapboxgl-ctrl-zoom-in]:rounded-b-none! [&_.mapboxgl-ctrl-zoom-out]:rounded-t-none!"
    >
      <Dialog.Title className="sr-only">Class location</Dialog.Title>
      <Dialog.Close asChild>
        <Button
          className="absolute top-4 left-1/2 z-20 h-11 -translate-x-1/2 px-5 shadow-md"
          color="primary"
          radius="full"
        >
          <X aria-hidden size={18} />
          Close map
        </Button>
      </Dialog.Close>
      {node && (
        <>
          {map}
          <aside
            aria-label="Class details on map"
            className="absolute start-4 top-4 z-10 max-h-[calc(100%-2rem)] w-[352px] overflow-y-auto overscroll-contain rounded-2xl border border-divider bg-background shadow-2xl"
          >
            {panel}
          </aside>
        </>
      )}
    </Dialog.Content>
  )
}

export function VenueMapPreview({
  event,
  where,
  renderDesktopPanel,
  register,
}: {
  event: Event
  where: string
  register: ReactNode
  renderDesktopPanel?: (directions: ReactNode) => ReactNode
}) {
  const { t } = useLocale()
  const desktop = Boolean(renderDesktopPanel)
  const { theme } = useTheme()
  const touch = useCoarsePointer()
  const device = new URLSearchParams(window.location.search).get('device')
  const expandLabel = (device ? device === 'iPhone' : touch) ? 'Tap to expand' : 'Expand map'
  const { latitude, longitude, street } = event.address ?? {}

  if (
    event.eventType !== 'offline' ||
    hasApproximatePlace(event) ||
    latitude == null ||
    longitude == null ||
    !street
  )
    return null

  const point = { latitude, longitude }
  const dimensions = desktop ? { width: 480, height: 250 } : { width: 600, height: 228 }
  const image = staticMapUrl({ ...point, ...dimensions })
  const name = event.title
  const map = (
    <ReactMapGL
      initialViewState={{
        ...point,
        zoom: desktop ? 13 : 15,
        padding: desktop ? { left: 384, top: 0, right: 0, bottom: 0 } : undefined,
      }}
      logoPosition={desktop ? 'bottom-right' : 'bottom-left'}
      mapStyle={'mapbox://styles/' + mapStyles[theme]}
      mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESSTOKEN}
    >
      <Marker {...point} color="#df785f" />
      <NavigationControl position="top-right" showCompass={false} />
    </ReactMapGL>
  )

  return (
    <Dialog.Root>
      <div
        className={
          desktop
            ? 'relative isolate overflow-hidden rounded-t-[15px] bg-gray-3 pb-5 before:block before:aspect-[480/228]'
            : 'relative isolate overflow-hidden rounded-lg border border-divider bg-gray-3 pb-5 before:block before:aspect-[3.1] before:min-h-24'
        }
      >
        <Dialog.Trigger asChild>
          <button
            data-vaul-no-drag
            aria-label={`${expandLabel} — full-screen venue map`}
            className="absolute inset-0 w-full cursor-zoom-in focus-visible:outline-offset-[-4px]"
            type="button"
          >
            {image && <img alt="" className="size-full object-cover" src={image} />}
            <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded bg-background/80 px-1.5 py-0.5 text-xs font-normal text-gray-11">
              <Maximize2 aria-hidden size={12} strokeWidth={1.5} />
              {expandLabel}
            </span>
          </button>
        </Dialog.Trigger>
        <div className="absolute end-2 bottom-2">
          <VenueDirections compact {...point} />
        </div>
      </div>
      {renderDesktopPanel ? (
        <Dialog.Portal container={widgetOverlayContainer()}>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-background" />
          <DesktopClassMap
            map={map}
            panel={renderDesktopPanel(
              <ClassAction
                href={googleRoute(latitude, longitude)}
                icon={<Navigation size={18} />}
                label={t('event.actions.directions')}
                target="_blank"
              />,
            )}
          />
        </Dialog.Portal>
      ) : (
        <ModalContent
          className="h-full! max-h-none! w-full! max-w-none! rounded-none! border-0! pt-[env(safe-area-inset-top)]"
          closeLabel="Close map"
          title="Class location"
        >
          <div className="relative min-h-0 flex-1">{map}</div>
          <div className="mx-auto flex w-full max-w-[720px] shrink-0 flex-col gap-2 px-6 pt-3 pb-[max(8px,env(safe-area-inset-bottom))]">
            <div>
              <p className="font-semibold">{name}</p>
              <p className="text-sm text-gray-11">{where}</p>
            </div>
            <div className="grid grid-cols-2 items-start gap-2">
              <VenueDirections {...point} />
              {register}
            </div>
          </div>
        </ModalContent>
      )}
    </Dialog.Root>
  )
}
