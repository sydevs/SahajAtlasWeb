import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { ImageCarousel, type Slide } from './ImageCarousel'

export default { title: 'Molecules' } satisfies StoryDefault

const slides: Slide[] = [
  {
    src: 'https://picsum.photos/seed/atlas-hall/1600/1200',
    alt: 'Meditation hall',
    caption: 'A sunlit meditation hall',
  },
  {
    src: 'https://picsum.photos/seed/atlas-group/1600/1200',
    alt: 'Group session',
    caption: 'A group meditating together',
  },
  {
    src: 'https://picsum.photos/seed/atlas-garden/1600/1200',
    alt: 'Garden venue',
    caption: 'An outdoor garden venue',
  },
]

/**
 * ImageCarousel — an autoplaying Swiper carousel of images that opens a lazy
 * lightbox on tap. With a single slide the swiper is disabled; with none it
 * renders nothing.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection title="Carousel">
      <div className="max-w-md">
        <ImageCarousel slides={slides} />
      </div>
    </StorySection>

    <StorySection description="A single slide disables paging and autoplay." title="Single Image">
      <div className="max-w-md">
        <ImageCarousel slides={[slides[0]]} />
      </div>
    </StorySection>

    <StorySection description="No slides renders nothing (empty below)." title="Empty">
      <div className="max-w-md text-sm text-gray-11">
        <ImageCarousel slides={[]} />
        (no carousel)
      </div>
    </StorySection>

    <StorySection inContext={true} title="Examples">
      <div className="max-w-md overflow-hidden rounded-lg border border-divider">
        <ImageCarousel slides={slides} />
        <div className="px-6 pb-6">
          <div className="text-lg font-semibold">Saturday Morning Meditation</div>
          <div className="text-sm text-gray-11">Town Hall, Cambridge</div>
        </div>
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Image Carousel'
