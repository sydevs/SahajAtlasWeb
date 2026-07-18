import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { ActionCircle, ActionRow } from './ActionRow'

import { CalendarIcon, CallIcon, DirectionsIcon, ShareIcon } from '@/components/atoms/Icons'

export default { title: 'Molecules' } satisfies StoryDefault

/**
 * ActionRow / ActionCircle — the labelled tonal-circle secondary actions under
 * an event's Register CTA. All circles carry equal weight (emphasis belongs to
 * Register); the one sanctioned `emphasized` case is Contact on an inactive
 * event, which has no Register. The row centres while everything fits and
 * scrolls with an edge fade when it overflows.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="The physical-live set: Directions · Add to calendar · Contact · Share."
      title="Physical event"
    >
      <div className="max-w-md">
        <ActionRow>
          <ActionCircle
            external
            href="https://maps.example"
            icon={<DirectionsIcon />}
            label="Directions"
          />
          <ActionCircle icon={<CalendarIcon />} label="Add to calendar" onClick={() => {}} />
          <ActionCircle href="tel:+441234567890" icon={<CallIcon />} label="Contact" />
          <ActionCircle icon={<ShareIcon size={20} />} label="Share" onClick={() => {}} />
        </ActionRow>
      </div>
    </StorySection>

    <StorySection
      description="An inactive event has no Register, so Contact is the emphasized action."
      title="Emphasized contact"
    >
      <div className="max-w-md">
        <ActionRow>
          <ActionCircle emphasized href="tel:+441234567890" icon={<CallIcon />} label="Contact" />
          <ActionCircle
            external
            href="https://maps.example"
            icon={<DirectionsIcon />}
            label="Directions"
          />
          <ActionCircle icon={<ShareIcon size={20} />} label="Share" onClick={() => {}} />
        </ActionRow>
      </div>
    </StorySection>

    <StorySection
      description="A narrow container scrolls horizontally with an edge fade."
      title="Overflow"
    >
      <div className="w-52 rounded-lg border border-divider p-2">
        <ActionRow>
          <ActionCircle
            external
            href="https://maps.example"
            icon={<DirectionsIcon />}
            label="Directions"
          />
          <ActionCircle icon={<CalendarIcon />} label="Add to calendar" onClick={() => {}} />
          <ActionCircle href="tel:+441234567890" icon={<CallIcon />} label="Contact" />
          <ActionCircle icon={<ShareIcon size={20} />} label="Share" onClick={() => {}} />
        </ActionRow>
      </div>
    </StorySection>

    <StorySection
      description="Long i18n labels clamp at two lines, then ellipsis — never pushing layout."
      title="Label budget"
    >
      <div className="max-w-md">
        <ActionRow>
          <ActionCircle icon={<CalendarIcon />} label="Añadir al calendario" onClick={() => {}} />
          <ActionCircle
            href="tel:+4912345"
            icon={<CallIcon />}
            label="Kontaktaufnahme mit dem Gastgeber"
          />
          <ActionCircle icon={<ShareIcon size={20} />} label="Share" onClick={() => {}} />
        </ActionRow>
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Action Row'
