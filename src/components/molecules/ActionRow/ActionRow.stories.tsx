import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { ActionCircle, ActionRow } from './ActionRow'

import { CalendarIcon, CallIcon, DirectionsIcon, ShareIcon } from '@/components/atoms/Icons'

export default { title: 'Molecules' } satisfies StoryDefault

/**
 * ActionRow / ActionCircle — the labelled tonal-circle secondary actions under
 * an event's Register CTA. All circles carry equal weight (emphasis belongs to
 * Register); the one sanctioned `emphasized` case is Contact on an inactive
 * event, which has no Register. The whole set always stays on ONE line: the
 * circles share the row width equally and only the labels narrow, so the row
 * neither wraps nor scrolls however many actions a state carries.
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
            isExternal
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
      description="An inactive event has no Register, so Contact leads with the solid variant — the same `variant` a Button takes, off the same shared surface recipe."
      title="Emphasized contact"
    >
      <div className="max-w-md">
        <ActionRow>
          <ActionCircle
            href="tel:+441234567890"
            icon={<CallIcon />}
            label="Contact"
            variant="solid"
          />
          <ActionCircle
            isExternal
            href="https://maps.example"
            icon={<DirectionsIcon />}
            label="Directions"
          />
          <ActionCircle icon={<ShareIcon size={20} />} label="Share" onClick={() => {}} />
        </ActionRow>
      </div>
    </StorySection>

    <StorySection
      description="The circle takes the same colour × variant matrix as Button, so an action can be skinned like any other control. The app uses primary flat (and solid for the one emphasized case)."
      title="Colors"
    >
      <div className="flex max-w-md flex-col gap-3">
        {(['flat', 'solid', 'faded', 'bordered', 'ghost'] as const).map((variant) => (
          <ActionRow key={variant}>
            {(['primary', 'secondary', 'default', 'danger'] as const).map((color) => (
              <ActionCircle
                key={color}
                color={color}
                icon={<CallIcon />}
                label={`${variant}/${color}`}
                variant={variant}
                onClick={() => {}}
              />
            ))}
          </ActionRow>
        ))}
      </div>
    </StorySection>

    <StorySection
      description="`size` drives the circle from the shared scale — the app uses lg (48px) so the touch target clears the 44px floor."
      title="Sizes"
    >
      <div className="max-w-md">
        <ActionRow>
          {(['sm', 'md', 'lg'] as const).map((size) => (
            <ActionCircle
              key={size}
              icon={<CallIcon />}
              label={size}
              size={size}
              onClick={() => {}}
            />
          ))}
        </ActionRow>
      </div>
    </StorySection>

    <StorySection
      description="Squeezed well below the real panel width: the circles keep their touch target and the labels take the hit, wrapping to two lines rather than the row scrolling."
      title="Narrow container"
    >
      <div className="w-52 rounded-lg border border-divider p-2">
        <ActionRow>
          <ActionCircle
            isExternal
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
