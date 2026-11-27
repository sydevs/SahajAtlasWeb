import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { ImageGallery, type Slide } from './ImageGallery'

export default { title: 'Molecules' } satisfies StoryDefault

// Mixed shapes, so the masonry has something to pack.
const slides: Slide[] = [
  {
    src: 'https://picsum.photos/seed/atlas-hall/1600/1200',
    width: 1600,
    height: 1200,
    alt: 'Meditation hall',
    caption: 'A sunlit meditation hall',
  },
  {
    src: 'https://picsum.photos/seed/atlas-group/1200/1600',
    width: 1200,
    height: 1600,
    alt: 'Group session',
    caption: 'A group meditating together',
  },
  {
    src: 'https://picsum.photos/seed/atlas-garden/1600/900',
    width: 1600,
    height: 900,
    alt: 'Garden venue',
    caption: 'An outdoor garden venue',
  },
  {
    src: 'https://picsum.photos/seed/atlas-candle/1200/1200',
    width: 1200,
    height: 1200,
    alt: 'Candle',
  },
  {
    src: 'https://picsum.photos/seed/atlas-path/1200/1500',
    width: 1200,
    height: 1500,
    alt: 'Garden path',
    caption: 'The path to the hall',
  },
]

/**
 * ImageGallery — a two-column CSS masonry of rounded image tiles. Tapping one opens a full-screen
 * lightbox (Radix Dialog) with previous/next, arrow keys and swipe. A single image spans the
 * width. With none, it renders nothing.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection title="Gallery">
      <div className="max-w-sm">
        <ImageGallery slides={slides} />
      </div>
    </StorySection>

    <StorySection description="Two images share one row." title="Two Images">
      <div className="max-w-sm">
        <ImageGallery slides={slides.slice(0, 2)} />
      </div>
    </StorySection>

    <StorySection description="A single image spans the full width." title="Single Image">
      <div className="max-w-sm">
        <ImageGallery slides={[slides[0]]} />
      </div>
    </StorySection>

    <StorySection description="No slides renders nothing (empty below)." title="Empty">
      <div className="max-w-sm text-sm text-gray-11">
        <ImageGallery slides={[]} />
        (no gallery)
      </div>
    </StorySection>

    <StorySection inContext={true} title="Examples">
      <div className="flex max-w-sm flex-col gap-4 rounded-lg border border-divider px-4 py-6">
        <div>
          <div className="text-lg font-semibold">Saturday Morning Meditation</div>
          <div className="text-sm text-gray-11">Town Hall, Cambridge</div>
        </div>
        <ImageGallery slides={slides} />
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Image Gallery'
