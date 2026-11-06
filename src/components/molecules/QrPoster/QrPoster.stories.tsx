import type { Story, StoryDefault } from '@ladle/react'

import { StorySection, StoryWrapper } from '../../ladle'

import { QrPoster } from './QrPoster'

export default { title: 'Molecules' } satisfies StoryDefault

/**
 * QrPoster — a QR code of the class link, for hosts printing posters. Most people opening Share
 * want to send a link to a friend, so it stays closed behind one row until asked for, and the
 * encoder only downloads then. The code is always black on white, in dark mode too, because
 * scanners need dark on light. Open the row to see it, with "Download for printing" under it.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection description="Closed behind one row. Open it to make the code." title="Variants">
      <div className="max-w-sm">
        <QrPoster label="Evening Meditation at The Hut" url="https://example.org/gb/london/711" />
      </div>
    </StorySection>

    <StorySection
      description="About as wide as a phone's Share sheet. The code and the button fill it."
      title="Widths"
    >
      <div className="w-80">
        <QrPoster label="Evening Meditation at The Hut" url="https://example.org/gb/london/711" />
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'QR Poster'
