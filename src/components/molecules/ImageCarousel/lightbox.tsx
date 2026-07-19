import type { Slide } from './ImageCarousel'

import YARLightbox from 'yet-another-react-lightbox'
import Captions from 'yet-another-react-lightbox/plugins/captions'
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'

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
export function Lightbox({
  slides,
  isOpen,
  index,
  onClose,
}: {
  slides: Slide[]
  isOpen: boolean
  index: number
  onClose: () => void
}) {
  const single = slides.length <= 1
  const plugins = single ? [Captions, Zoom] : [Captions, Thumbnails, Zoom]

  return (
    <YARLightbox
      close={onClose}
      index={index}
      open={isOpen}
      plugins={plugins}
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
