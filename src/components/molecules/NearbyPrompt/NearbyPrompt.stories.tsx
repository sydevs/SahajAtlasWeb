import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { NearbyPrompt } from './NearbyPrompt'

export default { title: 'Molecules' } satisfies StoryDefault

/**
 * NearbyPrompt — the dismissible IP-geolocation suggestion shown above the list on
 * the top-level views ("Looking for classes near %{city}?"). A slim, primary-tinted
 * `Alert` whose text is a button into the distance-ranked nearby search; the small ×
 * dismisses it for the session. Announced politely (`role="status"`), and its
 * horizontal padding lines up with the drawer header. Framed as an approximate
 * guess, never a definitive "your location".
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="The text is a button (into the nearby search); the small × dismisses it. One slim, primary-tinted line, padded to align with the drawer header."
      title="Nearby suggestion"
    >
      <div className="flex max-w-sm flex-col gap-4">
        <NearbyPrompt city="Paris" onAccept={() => {}} onClose={() => {}} />
        <NearbyPrompt city="San Cristóbal de La Laguna" onAccept={() => {}} onClose={() => {}} />
      </div>
    </StorySection>
  </StoryWrapper>
)

Default.storyName = 'Nearby Prompt'
