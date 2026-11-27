import type { Slide } from './ImageGallery'

import { type KeyboardEvent, type MouseEvent, type PointerEvent, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import * as Dialog from '@radix-ui/react-dialog'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

import { useOpenerRestore } from '@/hooks/use-opener-restore'
import { overlayContainer } from '@/lib/overlay'

export type LightboxProps = {
  slides: Slide[]
  /** The slide on screen, or `null` while closed. */
  index: number | null
  onIndexChange: (index: number) => void
  onClose: () => void
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
 * Full-screen viewer for the gallery's images, on Radix Dialog: Radix owns the focus trap, Esc,
 * and scroll lock. It portals through `overlayContainer()` like every other overlay, so it picks
 * up the theme and stays inside a frame.
 */
export function Lightbox({ slides, index, onIndexChange, onClose }: LightboxProps) {
  const { t, i18n } = useTranslation()
  // Right to left, "next" sits on the left: the same reading `Widget.tsx` sets `dir` from.
  const rtl = i18n.dir() === 'rtl'
  const open = index !== null
  const restore = useOpenerRestore<HTMLDivElement>(open)
  const swipeStart = useRef<number | null>(null)
  const swiped = useRef(false)

  const count = slides.length
  const current = index ?? 0
  const slide = slides[current]
  const multiple = count > 1

  const step = (delta: number) => onIndexChange((current + delta + count) % count)

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!multiple || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
    event.preventDefault()
    const forward = (event.key === 'ArrowRight') !== rtl

    step(forward ? 1 : -1)
  }

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    // Cleared here as well as on click: a browser need not fire a click after a drag, and a flag
    // left standing would swallow the next real tap on the backdrop.
    swiped.current = false
    swipeStart.current = event.pointerType === 'mouse' ? null : event.clientX
  }

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const start = swipeStart.current

    swipeStart.current = null
    if (!multiple || start === null) return
    const dx = event.clientX - start

    if (Math.abs(dx) < SWIPE_PX) return
    swiped.current = true
    // A swipe drags the photo, so a leftward swipe brings in the one to its right.
    const forward = dx < 0 !== rtl

    step(forward ? 1 : -1)
  }

  // The content covers the overlay, so Radix's click-outside never fires: a click on the empty
  // space around the photo closes it instead, unless it ended a swipe.
  const onBackdropClick = (event: MouseEvent<HTMLElement>) => {
    const endedSwipe = swiped.current

    swiped.current = false
    if (endedSwipe || !(event.target instanceof Element)) return
    if (!event.target.closest('img, button, figcaption')) onClose()
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal container={overlayContainer()}>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/90" />
        <Dialog.Content
          ref={restore.adoptContent}
          aria-describedby={undefined}
          // `touch-pinch-zoom` leaves pinch to the browser and keeps a sideways drag ours, so a
          // swipe reaches the pointer handlers rather than being cancelled for a pan.
          className="fixed inset-0 z-50 flex touch-pinch-zoom flex-col text-white outline-none select-none"
          onClick={onBackdropClick}
          onCloseAutoFocus={restore.restoreFocus}
          onKeyDown={onKeyDown}
          onOpenAutoFocus={focusDialog}
          onPointerCancel={() => (swipeStart.current = null)}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
        >
          <Dialog.Title className="sr-only">
            {multiple
              ? t('event.a11y.photo_position', { current: current + 1, total: count })
              : t('event.a11y.photo')}
          </Dialog.Title>

          <div className="flex shrink-0 justify-end p-2">
            <Dialog.Close aria-label={t('event.a11y.close_photo')} className={control}>
              <X size={20} />
            </Dialog.Close>
          </div>

          <figure className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4 pb-6">
            {slide && (
              <img
                key={slide.src}
                alt={slide.alt ?? ''}
                className="min-h-0 max-w-full flex-1 object-contain"
                draggable={false}
                src={slide.src}
              />
            )}
            {slide?.caption && (
              <figcaption className="max-w-prose shrink-0 text-center text-sm">
                {slide.caption}
              </figcaption>
            )}
          </figure>

          {multiple && (
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
  )
}
