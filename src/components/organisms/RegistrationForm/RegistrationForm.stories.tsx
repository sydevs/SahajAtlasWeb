import type { Story, StoryDefault } from '@ladle/react'

// Not in the organisms barrel (reached only via the RegistrationView drawer);
// import from the co-located file.
import { StoryWrapper, StorySection } from '../../ladle'

import { RegistrationForm } from './RegistrationForm'

import { Button } from '@/components/atoms/Button'

export default { title: 'Organisms' } satisfies StoryDefault

const upcomingDates = [new Date('2026-08-01T18:00:00Z'), new Date('2026-08-08T18:00:00Z')]

/**
 * RegistrationForm — the form-only registration component, rendered in the
 * RegistrationView drawer body. It carries the date/name/email fields, an opt-in
 * mailing-list consent checkbox above the privacy note, and the thank-you/share
 * screen on success. External registration (a link out) is handled by
 * EventDetails, not the form.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="The native form as it renders in the drawer body; note the opt-in consent checkbox above the privacy note."
      title="Native"
    >
      <div className="max-w-md rounded-lg border border-divider p-4">
        <RegistrationForm
          eventId={1}
          eventTitle="Saturday Morning Meditation"
          eventUrl="https://atlas.example/e/1"
          isOnline={false}
          questions={[]}
          upcomingDates={upcomingDates}
        />
      </div>
    </StorySection>

    <StorySection description="An online event also shows the join-link notice." title="Online">
      <div className="max-w-md rounded-lg border border-divider p-4">
        <RegistrationForm
          eventId={2}
          eventTitle="Online Meditation"
          eventUrl="https://atlas.example/e/2"
          isOnline={true}
          questions={[]}
          upcomingDates={upcomingDates}
        />
      </div>
    </StorySection>

    <StorySection
      description="External registration links out to the host's page — rendered by EventDetails, shown here for reference."
      title="External"
    >
      <Button
        color="primary"
        href="https://example.com/register"
        rel="noopener noreferrer"
        target="_blank"
        variant="flat"
      >
        Register now
      </Button>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Registration Form'
