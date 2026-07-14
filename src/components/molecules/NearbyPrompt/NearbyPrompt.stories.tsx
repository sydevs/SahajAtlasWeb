import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { NearbyPrompt } from './NearbyPrompt'

export default { title: 'Molecules' } satisfies StoryDefault

/**
 * NearbyPrompt — the dismissible IP-geolocation suggestion shown above the list on
 * the top-level views. The whole tinted card navigates into the distance-ranked
 * nearby search; the corner × dismisses it for the session. The copy frames the
 * location as an approximate guess, never a definitive "your location".
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="The whole card is one button (into the nearby search); the × dismisses it. Framed as an approximate guess."
      title="Nearby suggestion"
    >
      <div className="flex max-w-sm flex-col gap-4">
        <NearbyPrompt city="Paris" onDismiss={() => {}} onSelect={() => {}} />
        <NearbyPrompt city="San Cristóbal de La Laguna" onDismiss={() => {}} onSelect={() => {}} />
      </div>
    </StorySection>
  </StoryWrapper>
)

Default.storyName = 'Nearby Prompt'
