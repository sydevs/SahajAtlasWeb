import type { Slide } from './ImageCarousel'

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
 * It imports the library and its CSS, so it is reached only through
 * ImageCarousel's `React.lazy` — never statically — keeping YARL and its styles
 * out of the initial bundle until a photo is opened. The widget's JS-injected
 * CSS picks up the lazily-loaded stylesheet, so it works embedded.
 *
 * Captions render each slide's `caption`; Zoom handles scroll, double-click/tap
 * and pinch. Thumbnails and the prev/next carousel only matter for multi-slide
 * groups, so they are dropped for a single slide.
 */
export type LightboxProps = {
  slides: Slide[]
  isOpen: boolean
  /** Which slide to open on. */
  index: number
  onClose: () => void
}

export function Lightbox({ slides, isOpen, index, onClose }: LightboxProps) {
  const single = slides.length <= 1
  const plugins = single ? [Captions, Zoom] : [Captions, Thumbnails, Zoom]

  return (
    <YARLightbox
      close={onClose}
      index={index}
      open={isOpen}
      plugins={plugins}
      // Portal into the theme root rather than YARL's default `document.body`, like
      // every other overlay in the app (`overlayContainer`). Required since #91: the
      // built stylesheet — YARL's own `.yarl__*` rules included — is confined under the
      // widget's scope class, so a lightbox mounted outside it renders unstyled. It
      // also stops the lightbox from mounting into the host page's <body>, and it
      // picks up the brand palette + light/dark class it never had there.
      //
      // One consequence, accepted: YARL locks scrolling by putting `.yarl__no_scroll` on
      // `document.body`, and that rule is now scoped like everything else — so in an
      // embed it no longer matches, and the host page can still scroll behind the
      // lightbox. Reaching back out to freeze someone else's page is the thing this
      // widget is trying to stop doing (the release review flags the modal drawer's
      // host-scroll lock as a defect, not a feature), so the lock stays lost.
      portal={{ root: overlayContainer() ?? null }}
      // A single slide has nowhere to navigate, so drop the prev/next arrows
      // (YARL would otherwise show them and wrap back to the same image).
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
