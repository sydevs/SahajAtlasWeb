import { useLayoutEffect, useState, useRef, useEffect } from 'react'
import { BatteryFull, ChevronLeft, Ellipsis, PanelTop, RotateCw, Signal, Wifi } from 'lucide-react'

import { StoryNotes } from './StoryNotes'
import { ClassPage, type ClassExample } from './ClassPage'

import { Checkbox } from '@/components/atoms/Checkbox'
import { ToggleGroup, ToggleGroupItem } from '@/components/atoms/ToggleGroup'
type Device = 'Desktop' | 'iPhone'
function screenUrl(device: Device, { showPhotos, shortDescription, showHostBanner }: ClassExample) {
  const params = new URLSearchParams({
    story: 'views--class-page',
    mode: 'preview',
    screen: 'class',
    device,
  })

  if (showHostBanner) params.set('banner', '1')
  if (!showPhotos) params.set('photos', '0')
  if (shortDescription) params.set('description', 'short')

  return `?${params}`
}
function PhoneBrowserBar() {
  return (
    <div aria-hidden className="pointer-events-none shrink-0 bg-white text-black">
      <div className="flex h-14 items-center gap-2 px-5">
        <span className="grid size-10 place-items-center rounded-full border border-gray-3 text-gray-8">
          <ChevronLeft size={18} />
        </span>
        <span className="flex h-10 min-w-0 flex-1 items-center justify-between gap-2 rounded-full border border-gray-3 px-4 text-sm">
          <PanelTop size={16} />
          <span className="truncate">{window.location.hostname}</span>
          <RotateCw size={15} />
        </span>
        <span className="grid size-10 place-items-center rounded-full border border-gray-3">
          <Ellipsis size={18} />
        </span>
      </div>
      <div className="flex h-[34px] items-end justify-center pb-2">
        <span className="h-[5px] w-[124px] rounded-full bg-black" />
      </div>
    </div>
  )
}

// Keep the viewport at device width even when two previews share a small workspace.
function DevicePreview({ device, example }: { device: Device; example: ClassExample }) {
  const slot = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const node = slot.current

    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })

    observer.observe(node)

    return () => observer.disconnect()
  }, [])
  const phone = device === 'iPhone'
  const width = phone ? 420 : 1280
  const height = phone ? 892 : 840
  const scale = Math.min(1, size.width / width, size.height / height)
  const title = device + ' class page'

  return (
    <div ref={slot} className="flex min-h-0 min-w-0 justify-center overflow-hidden">
      {scale > 0 && (
        <div style={{ width: width * scale, height: height * scale }}>
          <div
            className={
              phone
                ? 'rounded-[62px] bg-[#212124] p-[9px]'
                : 'overflow-hidden rounded-md bg-background ring-1 ring-divider'
            }
            style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}
          >
            <div
              className={
                phone
                  ? 'isolate flex size-full flex-col overflow-hidden rounded-[53px] bg-white'
                  : 'size-full'
              }
            >
              {phone && (
                <div
                  aria-hidden
                  className="relative flex h-14 shrink-0 items-center justify-between px-9 font-sans text-[15px] font-semibold text-black"
                >
                  <span>9:41</span>
                  <span className="absolute top-3 left-1/2 h-8 w-[104px] -translate-x-1/2 rounded-full bg-black" />
                  <span className="flex items-center gap-1">
                    <Signal size={16} />
                    <Wifi size={15} />
                    <BatteryFull size={21} />
                  </span>
                </div>
              )}
              <iframe
                className={
                  phone ? 'block min-h-0 w-full flex-1 border-0' : 'block size-full border-0'
                }
                src={screenUrl(device, example)}
                title={title}
              />
              {phone && <PhoneBrowserBar />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
function ClassPreviewBoard() {
  // Ladle may reload the story after an edit. Keep the reviewer's place in this tab.
  const [device, setDevice] = useState<Device>(() =>
    sessionStorage.getItem('class-board-device') === 'iPhone' ? 'iPhone' : 'Desktop',
  )
  const [showPhotos, setShowPhotos] = useState(
    () => sessionStorage.getItem('class-board-photos') !== 'false',
  )
  const [showHostBanner, setShowHostBanner] = useState(
    () => sessionStorage.getItem('class-board-host-banner') !== 'false',
  )
  const [shortDescription, setShortDescription] = useState(
    () => sessionStorage.getItem('class-board-short-description') === 'true',
  )

  useEffect(() => {
    sessionStorage.setItem('class-board-device', device)
    sessionStorage.setItem('class-board-photos', String(showPhotos))
    sessionStorage.setItem('class-board-host-banner', String(showHostBanner))
    sessionStorage.setItem('class-board-short-description', String(shortDescription))
  }, [device, showPhotos, shortDescription, showHostBanner])

  return (
    <div className="fixed inset-0 flex flex-col bg-gray-2">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-divider bg-background px-4 py-2">
        <ToggleGroup
          joined
          aria-label="Preview device"
          type="single"
          value={device}
          onValueChange={(value) => {
            if (value === 'Desktop' || value === 'iPhone') setDevice(value)
          }}
        >
          <ToggleGroupItem value="Desktop">Desktop</ToggleGroupItem>
          <ToggleGroupItem value="iPhone">iPhone</ToggleGroupItem>
        </ToggleGroup>
        <Checkbox checked={showHostBanner} onCheckedChange={setShowHostBanner}>
          Show host banner
        </Checkbox>
        <Checkbox checked={showPhotos} onCheckedChange={setShowPhotos}>
          Show class photos
        </Checkbox>
        <Checkbox checked={shortDescription} onCheckedChange={setShortDescription}>
          Short description
        </Checkbox>
        <StoryNotes />
      </div>
      <div className="grid min-h-0 flex-1 p-3">
        <DevicePreview device={device} example={{ showPhotos, shortDescription, showHostBanner }} />
      </div>
    </div>
  )
}
export function ClassPagePreview() {
  const params = new URLSearchParams(window.location.search)

  return params.get('screen') === 'class' ? (
    <ClassPage
      shortDescription={params.get('description') === 'short'}
      showHostBanner={params.get('banner') === '1'}
      showPhotos={params.get('photos') !== '0'}
    />
  ) : (
    <ClassPreviewBoard />
  )
}
