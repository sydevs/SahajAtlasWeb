import type { EventImage } from '@/types'

import { type KeyboardEvent, type PointerEvent, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as Dialog from '@radix-ui/react-dialog'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

import { useOpenerRestore } from '@/hooks/use-opener-restore'
import { overlayContainer } from '@/lib/overlay'

export type ImageGalleryProps = {
  /** An image without a `url` is skipped. */
  images: EventImage[]
}

/** How far a touch has to travel sideways before it counts as a swipe, in px. */
const SWIPE_PX = 50

// A self-supplied dark disc rather than a theme token: the arrows sit over an arbitrary photo,
// where only their own backdrop keeps the glyph readable.
const control =
  'flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white focus-ring transition-colors hover:bg-black/70'

/**
 * Radix starts on the first tabbable control, the ×, which reads as though Close were already
 * chosen and rings it after a tap. The dialog itself takes focus instead, which is also where the
 * arrow keys are heard.
 */
const focusDialog = (event: Event) => {
  event.preventDefault()
  if (event.target instanceof HTMLElement) event.target.focus({ preventScroll: true })
}

/**
 * A two-column masonry of images, each opening a full-screen lightbox at itself. The lightbox is a
 * Radix Dialog portaled through `overlayContainer()`, so Radix owns the focus trap, Esc and scroll
 * lock, and it stays inside a frame.
 */
export function ImageGallery({ images }: ImageGalleryProps) {
  const { t, i18n } = useTranslation()
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const restore = useOpenerRestore<HTMLDivElement>(openIndex !== null)
  const swipeStart = useRef<number | null>(null)

  const shown = images.filter((image) => image.url)
  const count = shown.length

  if (count === 0) return null

  const current = openIndex ?? 0
  const image = shown[current]

  const step = (delta: number) => setOpenIndex((current + delta + count) % count)
  // Right to left, the photo on the right is the previous one.
  const stepToward = (right: boolean) => step(right !== (i18n.dir() === 'rtl') ? 1 : -1)

  const onKeyDown = (event: KeyboardEvent) => {
    if (count < 2 || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
    event.preventDefault()
    stepToward(event.key === 'ArrowRight')
  }

  const onPointerUp = (event: PointerEvent) => {
    const dx = event.clientX - (swipeStart.current ?? event.clientX)

    swipeStart.current = null
    // A swipe drags the photo, so a leftward one brings in the photo to its right.
    if (count > 1 && Math.abs(dx) >= SWIPE_PX) stepToward(dx < 0)
  }

  return (
    <>
      {/* CSS columns rather than a grid: each image keeps its own aspect ratio and the columns
          pack, with no measuring script. Columns fill top to bottom, so the left column holds
          the first half — the same order the lightbox steps through. */}
      <div className={count > 1 ? 'columns-2 gap-2' : undefined}>
        {shown.map((tile, index) => (
          // `data-vaul-no-drag`: the gallery renders on the drawer, where vaul reads a tap with
          // any micro-movement as a drag and swallows the click.
          <button
            key={tile.url}
            data-vaul-no-drag
            aria-label={tile.alt ?? t('event.a11y.view_photo')}
            className="mb-2 block w-full cursor-zoom-in break-inside-avoid overflow-clip rounded-lg bg-gray-3 focus-ring last:mb-0"
            type="button"
            onClick={() => setOpenIndex(index)}
          >
            {/* The stored size reserves the tile's box before the image arrives. */}
            <img
              alt={tile.alt ?? ''}
              className="block h-auto w-full"
              height={tile.height ?? undefined}
              loading="lazy"
              src={tile.url ?? undefined}
              width={tile.width ?? undefined}
            />
          </button>
        ))}
      </div>

      <Dialog.Root open={openIndex !== null} onOpenChange={(open) => !open && setOpenIndex(null)}>
        <Dialog.Portal container={overlayContainer()}>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/90" />
          <Dialog.Content
            ref={restore.adoptContent}
            aria-describedby={undefined}
            // `touch-pinch-zoom` leaves pinch to the browser and keeps a sideways drag ours, so a
            // swipe reaches the pointer handlers rather than being cancelled for a pan.
            className="fixed inset-0 z-50 flex touch-pinch-zoom flex-col text-white outline-none select-none"
            onCloseAutoFocus={restore.restoreFocus}
            onKeyDown={onKeyDown}
            onOpenAutoFocus={focusDialog}
            onPointerCancel={() => (swipeStart.current = null)}
            onPointerDown={(event) => {
              swipeStart.current = event.pointerType === 'mouse' ? null : event.clientX
            }}
            onPointerUp={onPointerUp}
          >
            <Dialog.Title className="sr-only">
              {t('event.a11y.photo_position', { current: current + 1, total: count })}
            </Dialog.Title>

            <div className="flex shrink-0 justify-end p-2">
              <Dialog.Close aria-label={t('event.a11y.close_photo')} className={control}>
                <X size={20} />
              </Dialog.Close>
            </div>

            {/* The alt text is the caption, so the image itself stays silent rather than read
                twice. */}
            <figure className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4 pb-6">
              <img
                key={image.url}
                alt=""
                className="min-h-0 max-w-full flex-1 object-contain"
                draggable={false}
                src={image.url ?? undefined}
              />
              {image.alt && (
                <figcaption className="max-w-prose shrink-0 text-center text-sm">
                  {image.alt}
                </figcaption>
              )}
            </figure>

            {count > 1 && (
              <>
                <button
                  aria-label={t('event.a11y.previous_photo')}
                  className={`${control} absolute start-2 top-1/2 -translate-y-1/2`}
                  type="button"
                  onClick={() => step(-1)}
                >
                  <ChevronLeft className="rtl:-scale-x-100" size={24} />
                </button>
                <button
                  aria-label={t('event.a11y.next_photo')}
                  className={`${control} absolute end-2 top-1/2 -translate-y-1/2`}
                  type="button"
                  onClick={() => step(1)}
                >
                  <ChevronRight className="rtl:-scale-x-100" size={24} />
                </button>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
