import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { GeolocationPrompt } from './GeolocationPrompt'

export default { title: 'Molecules' } satisfies StoryDefault

/**
 * GeolocationPrompt — the dismissible IP-geolocation suggestion shown above
 * the list on the top-level views ("Looking for classes near %{city}?"). A
 * slim, secondary-tinted `Alert` whose text is a button into the
 * distance-ranked nearby search. The small × dismisses it for the session.
 * It announces politely (`role="status"`), and its horizontal padding lines
 * up with the drawer header. It is framed as an approximate guess, never a
 * definitive "your location".
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="The text is a button (into the nearby search); the small × dismisses it. One slim, secondary-tinted line, padded to align with the drawer header."
      title="Nearby suggestion"
    >
      <div className="flex max-w-sm flex-col gap-4">
        <GeolocationPrompt city="Paris" onAccept={() => {}} onClose={() => {}} />
        <GeolocationPrompt
          city="San Cristóbal de La Laguna"
          onAccept={() => {}}
          onClose={() => {}}
        />
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Geolocation Prompt'
