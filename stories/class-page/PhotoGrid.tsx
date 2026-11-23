import type { Slide } from '@/components/molecules/ImageCarousel/ImageCarousel'

import { Suspense, lazy, useState } from 'react'
import { useTranslation } from 'react-i18next'

const Lightbox = lazy(() =>
  import('@/components/molecules/ImageCarousel/lightbox').then((m) => ({ default: m.Lightbox })),
)

export function PhotoGrid({ photos }: { photos: Slide[] }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<number | null>(null)

  if (photos.length === 0) return null

  return (
    <>
      <ul className={photos.length === 1 ? '' : 'columns-2 gap-2'}>
        {photos.map((photo, index) => (
          <li key={photo.src} className="mb-2 break-inside-avoid">
            <button
              className="block w-full overflow-hidden rounded-md bg-gray-3 outline-none focus-visible:ring-2 focus-visible:ring-focus"
              type="button"
              onClick={() => setOpen(index)}
            >
              <img
                alt={photo.alt ?? t('event.actions.view_photo')}
                className="block h-auto w-full"
                decoding="async"
                loading="lazy"
                src={photo.src}
              />
            </button>
          </li>
        ))}
      </ul>
      {open !== null && (
        <Suspense fallback={null}>
          <Lightbox isOpen index={open} slides={photos} onClose={() => setOpen(null)} />
        </Suspense>
      )}
    </>
  )
}
