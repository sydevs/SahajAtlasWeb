import type { Story, StoryDefault } from '@ladle/react'

// Not in the organisms barrel (reached only via the RegistrationView drawer);
// import from the co-located file.
import { StoryWrapper, StorySection } from '../../ladle'

import { RegistrationForm } from './RegistrationForm'

export default { title: 'Organisms' } satisfies StoryDefault

const upcomingDates = [new Date('2026-08-01T18:00:00Z'), new Date('2026-08-08T18:00:00Z')]

/**
 * RegistrationForm — the form-only registration component, rendered in the
 * RegistrationView drawer body. It carries the date/name/email fields, the
 * privacy note, and the thank-you/share screen on success. External
 * registration (a link out) is handled by EventDetails, not the form.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="The native form as it renders in the drawer body: date, name and email fields above the privacy note."
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
      description="Custom questions from the CMS render as extra fields below the standard ones. The default stories pass none, so this is the only place the question rendering is exercised."
      title="With questions"
    >
      <div className="max-w-md rounded-lg border border-divider p-4">
        <RegistrationForm
          eventId={3}
          eventTitle="Beginners Course"
          eventUrl="https://atlas.example/e/3"
          isOnline={false}
          questions={['How did you hear about us?', 'Any prior experience with meditation?']}
          upcomingDates={upcomingDates}
        />
      </div>
    </StorySection>

    <StorySection
      description="Submit the empty form above to see the validation state: a danger border plus error text that is wired to its field with aria-invalid + aria-describedby, so a screen reader announces it with the field rather than as a stray sentence."
      title="Validation"
    >
      <div className="max-w-md rounded-lg border border-divider p-4">
        <RegistrationForm
          eventId={4}
          eventTitle="Validation demo"
          eventUrl="https://atlas.example/e/4"
          isOnline={false}
          questions={[]}
          upcomingDates={upcomingDates}
        />
      </div>
    </StorySection>

    {/* The external-registration CTA is EventRegisterBar's, not the form's — see
        the "External" section of the Event Details story, which renders the real
        component rather than a stand-in button. */}

    <div />
  </StoryWrapper>
)

Default.storyName = 'Registration Form'
