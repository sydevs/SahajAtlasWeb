import type { Slide } from './ImageCarousel'

import { useEffect } from 'react'
import YARLightbox from 'yet-another-react-lightbox'
import Captions from 'yet-another-react-lightbox/plugins/captions'
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'

import { overlayContainer } from '@/lib/overlay'

import 'yet-another-react-lightbox/styles.css'
import 'yet-another-react-lightbox/plugins/captions.css'
import 'yet-another-react-lightbox/plugins/thumbnails.css'

/**
 * Full-screen image lightbox wrapping `yet-another-react-lightbox`.
 *
 * It imports the library and its CSS. So it is reached only through
 * ImageCarousel's `React.lazy`, never statically. This keeps YARL and its
 * styles out of the initial bundle until a photo is opened. The widget's
 * JS-injected CSS picks up the lazily-loaded stylesheet, so it works
 * embedded.
 *
 * Captions render each slide's `caption`. Zoom handles scroll,
 * double-click or tap, and pinch. Thumbnails and the prev/next carousel
 * only matter for multi-slide groups, so they are dropped for a single
 * slide.
 */
export type LightboxProps = {
  slides: Slide[]
  isOpen: boolean
  /** Which slide to open on. */
  index: number
  onClose: () => void
}

/**
 * Freeze the page behind the lightbox for as long as it is open.
 *
 * YARL does this itself, by putting `.yarl__no_scroll` on `document.body`.
 * But since #91, every emitted selector confines under the widget's scope
 * class, and `document.body` sits outside it. So the class still lands,
 * and matches nothing. These are that rule's three declarations, applied
 * inline, which restore the behaviour without punching a hole in the
 * scoping.
 *
 * Freezing the host page is deliberate here. It is not the same call as
 * the modal drawer's incidental scroll lock. The lightbox covers the
 * entire viewport, so a page that scrolls behind it is simply broken.
 * Every property is captured and restored on close, so a host's own
 * inline styles survive the round trip.
 */
function useFrozenPageScroll(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return

    const { style } = document.body
    const previous = {
      height: style.height,
      overflow: style.overflow,
      overscrollBehavior: style.overscrollBehavior,
    }

    style.height = '100%'
    style.overflow = 'hidden'
    style.overscrollBehavior = 'none'

    return () => {
      style.height = previous.height
      style.overflow = previous.overflow
      style.overscrollBehavior = previous.overscrollBehavior
    }
  }, [active])
}

export function Lightbox({ slides, isOpen, index, onClose }: LightboxProps) {
  const single = slides.length <= 1
  const plugins = single ? [Captions, Zoom] : [Captions, Thumbnails, Zoom]

  useFrozenPageScroll(isOpen)

  return (
    <YARLightbox
      close={onClose}
      index={index}
      open={isOpen}
      plugins={plugins}
      // This portals into the theme root, instead of YARL's default
      // `document.body`, like every other overlay in the app
      // (`overlayContainer`). Required since #91: the built stylesheet,
      // including YARL's own `.yarl__*` rules, confines under the widget's
      // scope class. So a lightbox mounted outside it renders unstyled.
      // This also stops the lightbox from mounting into the host page's
      // <body>, and it picks up the brand palette and light/dark class it
      // never had there.
      //
      // This does cost YARL its own scroll lock, whose rule now sits
      // scoped out of reach. `useFrozenPageScroll` above puts those
      // declarations back.
      portal={{ root: overlayContainer() ?? null }}
      // A single slide has nowhere to navigate. So this drops the prev and
      // next arrows. YARL would otherwise show them and wrap back to the
      // same image.
      render={single ? { buttonPrev: () => null, buttonNext: () => null } : undefined}
      slides={slides.map((slide) => ({
        src: slide.src,
        alt: slide.alt,
        description: slide.caption,
      }))}
      zoom={{ scrollToZoom: true }}
    />
  )
}
