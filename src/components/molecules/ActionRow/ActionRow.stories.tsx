import type { Story, StoryDefault } from '@ladle/react'

import { Globe, Navigation, Phone, Share } from 'lucide-react'

import { StoryWrapper, StorySection } from '../../ladle'

import { ActionButton, ActionRow } from './ActionRow'

export default { title: 'Molecules' } satisfies StoryDefault

const ICON = 18

/** The quiet secondary actions under an event's Register button. */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection description="Directions, Contact, Share." title="Three actions">
      <div className="max-w-md">
        <ActionRow>
          <ActionButton
            isExternal
            href="https://maps.example"
            icon={<Navigation size={ICON} />}
            label="Directions"
          />
          <ActionButton href="tel:+441234567890" icon={<Phone size={ICON} />} label="Contact" />
          <ActionButton icon={<Share size={ICON} />} label="Share" onClick={() => {}} />
        </ActionRow>
      </div>
    </StorySection>

    <StorySection description="With Website, the icon moves above the label." title="Four actions">
      <div className="max-w-md">
        <ActionRow>
          <ActionButton
            isExternal
            stacked
            href="https://maps.example"
            icon={<Navigation size={ICON} />}
            label="Directions"
          />
          <ActionButton
            isExternal
            stacked
            href="https://example.org"
            icon={<Globe size={ICON} />}
            label="Website"
          />
          <ActionButton
            stacked
            href="tel:+441234567890"
            icon={<Phone size={ICON} />}
            label="Contact"
          />
          <ActionButton stacked icon={<Share size={ICON} />} label="Share" onClick={() => {}} />
        </ActionRow>
      </div>
    </StorySection>
  </StoryWrapper>
)
Default.storyName = 'Action Row'
