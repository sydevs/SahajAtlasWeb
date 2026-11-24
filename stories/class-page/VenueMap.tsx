import type { Event } from '@/types'

import { type ReactNode, useState, useCallback } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import ReactMapGL, { Marker, NavigationControl } from 'react-map-gl/mapbox'
import { Navigation, Maximize2, X } from 'lucide-react'

import { Button } from '@/components/atoms/Button'
import { ModalBody, ModalContent } from '@/components/atoms/Modal'
import { useCoarsePointer } from '@/config/responsive'
import { useLocale } from '@/hooks/use-locale'
import { usePublishedNode } from '@/hooks/use-published-node'
import { useTheme } from '@/hooks/use-theme'
import { frameElement, setFrame, overlayContainer } from '@/lib/overlay'
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

// Publish the dialog as the frame so a nested directions picker or registration stays inside it.
function ExpandedClassMap({
  map,
  name,
  where,
  actions,
}: {
  map: ReactNode
  name: string
  where: string
  actions: ReactNode
}) {
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
      className="fixed inset-0 isolate z-50 flex flex-col bg-background text-foreground outline-none"
    >
      <Dialog.Title className="sr-only">Class location</Dialog.Title>
      {node && (
        <>
          <div className="relative min-h-0 flex-1">{map}</div>
          <div className="border-t border-divider bg-background">
            <div className="mx-auto grid w-full max-w-[920px] items-center gap-3 px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] md:grid-cols-[1fr_auto]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{name}</p>
                  <p className="text-sm text-gray-11">{where}</p>
                </div>
                <Dialog.Close asChild>
                  <Button className="min-h-11 shrink-0" variant="ghost">
                    <X aria-hidden size={16} /> Close map
                  </Button>
                </Dialog.Close>
              </div>
              <div className="flex items-center gap-2 md:min-w-[300px] [&>*]:flex-1">{actions}</div>
            </div>
          </div>
        </>
      )}
    </Dialog.Content>
  )
}

export function VenueMapPreview({
  event,
  where,
  desktop = false,
  register,
}: {
  event: Event
  where: string
  register: ReactNode
  desktop?: boolean
}) {
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
      reuseMaps
      initialViewState={{
        ...point,
        zoom: 15,
      }}
      logoPosition="bottom-left"
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
      <Dialog.Portal container={overlayContainer()}>
        <ExpandedClassMap
          actions={
            <>
              <VenueDirections {...point} />
              {register}
            </>
          }
          map={map}
          name={name}
          where={where}
        />
      </Dialog.Portal>
    </Dialog.Root>
  )
}
