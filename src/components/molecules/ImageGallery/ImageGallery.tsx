import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Lightbox } from './lightbox'

/** One gallery image; also shown full-screen in the lightbox. */
export type Slide = {
  /** Full-resolution image URL. */
  src: string
  /** Accessible alt text. */
  alt?: string
  /** Caption shown under the image in the lightbox. */
  caption?: string
}

export type ImageGalleryProps = {
  slides: Slide[]
}

/**
 * A two-column masonry of images, each opening the lightbox at itself. A lone image spans the
 * full width.
 */
export function ImageGallery({ slides }: ImageGalleryProps) {
  const { t } = useTranslation()
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  if (slides.length === 0) return null

  return (
    <>
      {/* CSS columns rather than a grid: each image keeps its own aspect ratio and the columns
          pack, with no measuring script. Columns fill top to bottom, so the left column holds
          the first half — the same order the lightbox steps through. */}
      <div className={slides.length > 1 ? 'columns-2 gap-2' : undefined}>
        {slides.map((slide, index) => (
          // `data-vaul-no-drag`: the gallery renders on the drawer, where vaul reads a tap with
          // any micro-movement as a drag and swallows the click.
          <button
            key={slide.src}
            data-vaul-no-drag
            aria-label={slide.alt ?? t('event.a11y.view_photo')}
            className="mb-2 block w-full cursor-zoom-in break-inside-avoid overflow-clip rounded-lg bg-gray-3 focus-ring last:mb-0"
            type="button"
            onClick={() => setOpenIndex(index)}
          >
            <img
              alt={slide.alt ?? undefined}
              className="block h-auto w-full"
              loading="lazy"
              src={slide.src}
            />
          </button>
        ))}
      </div>

      <Lightbox
        index={openIndex}
        slides={slides}
        onClose={() => setOpenIndex(null)}
        onIndexChange={setOpenIndex}
      />
    </>
  )
}
