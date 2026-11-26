import type { Story, StoryDefault } from '@ladle/react'

// This is not in the molecules barrel: ShareView reaches it by leaf path, like ShareContent.
import { StoryWrapper, StorySection } from '../../ladle'

import { QrPoster } from './QrPoster'

export default { title: 'Molecules' } satisfies StoryDefault

const URL = 'https://wemeditate.com/map/gb/south-east/london/balham-library/1392'

/**
 * QrPoster — the closed "QR code for posters" row under the share buttons. Opening it fetches the
 * encoder (watch the Network tab for one `uqr` chunk) and draws the class link, black on white in
 * both themes, with a download sized for printing.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection description="Closed by default. Open it to load the code." title="Row">
      <div className="w-full max-w-md">
        <QrPoster label="Evening Meditation at The Hut" url={URL} />
      </div>
    </StorySection>
    <StorySection description="The opened row, when the encoder failed to load." title="Failed">
      <div className="w-full max-w-md">
        <QrPoster initial={{ status: 'failed' }} label="Evening Meditation at The Hut" url={URL} />
      </div>
    </StorySection>
  </StoryWrapper>
)
Default.storyName = 'QrPoster'
