import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { ShareContent } from './ShareContent'

export default { title: 'Molecules' } satisfies StoryDefault

const label = 'Saturday Morning Meditation'
const url = 'https://atlas.example/e/1'

/**
 * ShareContent — a click-to-copy URL field plus social share links. Generic
 * (label + url); the ShareView drawer renders it under a "Share <event>" header,
 * and the registration "thank you" screen reuses it directly.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="The copyable URL field and social share links."
      title="Share Content"
    >
      <div className="max-w-sm">
        <ShareContent label={label} url={url} />
      </div>
    </StorySection>

    <StorySection description="How the ShareView drawer frames it." title="In a share drawer">
      <div className="max-w-sm overflow-hidden rounded-lg border border-divider">
        <div className="px-4 pb-2 pt-4 text-lg font-bold">Share {label}</div>
        <div className="px-4 pb-4">
          <ShareContent label={label} url={url} />
        </div>
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Share Content'
