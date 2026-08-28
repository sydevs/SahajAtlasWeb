import type { Swiper as SwiperClass } from 'swiper'

import { Suspense, lazy, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Autoplay, Pagination, A11y, EffectFade } from 'swiper/modules'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Pause, SquarePlay } from 'lucide-react'

import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion'

/** One carousel slide; also shown full-screen in the lightbox. */
export type Slide = {
  /** Full-resolution image URL. */
  src: string
  /** Accessible alt text. */
  alt?: string
  /** Caption shown under the image in the lightbox. */
  caption?: string
}

// The lightbox wraps yet-another-react-lightbox and its CSS, so it is imported
// lazily (its own chunk) — never statically — keeping YARL out of the initial
// bundle until a photo is opened. Render it inside a <Suspense> boundary.
const Lightbox = lazy(() => import('./lightbox').then((m) => ({ default: m.Lightbox })))

const AUTOPLAY_DELAY_MS = 4000

export type ImageCarouselProps = {
  slides: Slide[]
}

export function ImageCarousel({ slides }: ImageCarouselProps) {
  const { t } = useTranslation('events')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [swiper, setSwiper] = useState<SwiperClass | null>(null)
  const [paused, setPaused] = useState(false)
  const reducedMotion = usePrefersReducedMotion()

  // Swiper's loop mode clones slides to fake infinite scrolling and needs more
  // than one slide to do it — with a single image it warns and renders a blank
  // track. Autoplay/pagination are equally pointless there, so a lone image is
  // shown as a plain, static slide.
  const carousel = slides.length > 1

  // Whether this carousel moves on its own AT ALL, versus whether it is moving
  // right now. Under `prefers-reduced-motion: reduce` it never does, so there is
  // nothing to pause and the control doesn't render — the images stay reachable
  // by swipe and by the pagination bullets, which is the whole carousel minus
  // the unrequested motion.
  const autoplays = carousel && !reducedMotion
  const playing = autoplays && !paused

  // Swiper's React wrapper merges changed params into the live instance but
  // never starts or stops autoplay for you (`updateSwiper`), so the declarative
  // config below only decides whether autoplay starts AT INIT — every later
  // change is ours to apply.
  //
  // `running` is the right field to compare against: a transient interaction
  // pause sets `paused`, not `running`, so this effect never mistakes one for a
  // stop. Comparing at all is what stops a re-render from restarting the 4s
  // countdown and re-emitting `autoplayStart` — `start()` has no re-entry guard
  // of its own. (It would not leak a timer; `run()` clears the previous one.)
  useEffect(() => {
    if (!swiper || swiper.destroyed) return

    if (swiper.autoplay.running === playing) return

    if (playing) swiper.autoplay.start()
    else swiper.autoplay.stop()
  }, [swiper, playing])

  if (slides.length === 0) return null

  const openAt = (index: number) => {
    setActiveIndex(index)
    setOpen(true)
  }

  return (
    <>
      {/* `relative` so the pause control can sit over the image. It wraps the
          Swiper rather than riding inside it (Swiper's `container-end` slot) so
          the button's stacking and position are ours, not the library's. */}
      <div className="relative w-full">
        <Swiper
          autoplay={autoplays && { delay: AUTOPLAY_DELAY_MS, disableOnInteraction: false }}
          // `w-full`: the carousel is mounted inside a flex row, where an
          // unsized Swiper root collapses to its content — which, since Swiper
          // sizes the slides FROM the root, meant a 48px-wide track (just the
          // slide padding) and an invisible image.
          //
          // `sy-carousel` is what our pagination theming keys on (globals.css).
          className="sy-carousel w-full"
          enabled={carousel}
          grabCursor={carousel}
          loop={carousel}
          modules={[Autoplay, Pagination, A11y, EffectFade]}
          // Swiper's built-in pagination: plain clickable bullets, one per slide.
          pagination={carousel && { clickable: true }}
          onSwiper={setSwiper}
        >
          {slides.map((slide, index) => (
            // No bottom padding: the bullets sit OVER the image (see globals.css), so
            // the slide is the image and nothing else. Reserving a band below it just
            // put dead space under the last thing in a view — and sizing that band to
            // the bullets left them butted against the image's edge instead.
            <SwiperSlide key={slide.src}>
              <button
                aria-label={slide.alt ?? t('details.view_photo')}
                className="block w-full cursor-zoom-in"
                type="button"
                onClick={() => openAt(index)}
              >
                <img
                  alt={slide.alt ?? undefined}
                  className="aspect-[4/3] w-full object-cover"
                  src={slide.src}
                />
              </button>
            </SwiperSlide>
          ))}
        </Swiper>

        {/* WCAG 2.2.2 (Pause, Stop, Hide): anything that moves for more than five
            seconds needs a way to stop it. A toggle button, so the accessible
            name stays put and `aria-pressed` carries the state — a name that
            flipped between "Pause"/"Play" alongside `aria-pressed` would announce
            the state twice, and disagree with itself while doing so.

            A plain button rather than the Button atom: every colour the atom
            offers is a theme token, and this sits on top of an arbitrary photo,
            where only a self-supplied backdrop makes the contrast predictable.
            It is the same reasoning (and the same white) as the pagination
            bullets it sits beside.

            `data-vaul-no-drag` is the part that does NOT come for free with that
            choice. The carousel renders inside the drawer (EventDetails), and
            vaul reads a tap carrying any micro-movement as a drag and swallows
            the click — so without it the one control this exists to add would
            fire only intermittently on touch, which is where it matters most.
            The Button atom sets it on every button; ActionRow carries it by hand
            for exactly this reason. */}
        {autoplays && (
          <button
            data-vaul-no-drag
            aria-label={t('details.pause_slideshow')}
            aria-pressed={paused}
            className="absolute bottom-2 end-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white outline-none transition-colors hover:bg-black/70 focus-visible:ring-2 focus-visible:ring-focus"
            type="button"
            onClick={() => setPaused((wasPaused) => !wasPaused)}
          >
            {paused ? <SquarePlay size={16} /> : <Pause size={16} />}
          </button>
        )}
      </div>

      {/* Mounted only once a photo is tapped, so the lazy YARL chunk (library +
          CSS) is fetched on first open rather than with the carousel. */}
      {open && (
        <Suspense fallback={null}>
          <Lightbox isOpen index={activeIndex} slides={slides} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
