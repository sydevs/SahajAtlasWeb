import type { Story, StoryDefault } from '@ladle/react'
import type { EventSchedule } from '@/types'

// This is not in the organisms barrel — it is reached only via the
// RegistrationView drawer. Import from the co-located file instead.
import { StoryWrapper, StorySection } from '../../ladle'

import { RegistrationForm } from './RegistrationForm'

import { RegistrationRefusedError } from '@/config/api/mutate'
import { useRegistrationDraft } from '@/config/store'

export default { title: 'Organisms' } satisfies StoryDefault

// Weekly, from a week out, so the date dropdown reads "Next week", "In 2 weeks", "In 3 weeks".
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const upcomingDates = [1, 2, 3, 4].map((weeks) => new Date(Date.now() + weeks * WEEK_MS))

// The form restores a draft for its own event id once, at mount, and re-checks a restored address.
const MISTYPED_EMAIL_EVENT = 9

// This is a real weekly recurrence, so the Confirmation story's calendar
// links carry an actual RRULE and TZID, rather than a degenerate one-off.
const weeklySchedule: EventSchedule = {
  firstDate: new Date('2026-07-01T17:30:00Z'),
  firstDate_tz: 'Europe/Prague',
  endTime: '20:45',
  recurrenceType: 'WEEKLY',
  interval: 1,
  weekdays: ['WE'],
  upcomingDates,
}

/**
 * RegistrationForm is the form-only registration component, rendered in
 * the RegistrationView drawer body. It carries the date, name, and email
 * fields, the privacy note, and the thank-you and share screen on success.
 * EventDetails handles external registration (a link out), not this form.
 */
export const Default: Story = () => {
  useRegistrationDraft.getState().setDraft(MISTYPED_EMAIL_EVENT, { email: 'anna@gmail' })

  return <RegistrationFormStory />
}

const RegistrationFormStory = () => (
  <StoryWrapper>
    <StorySection
      description="The native form as it renders in the drawer body: the first-class date as a dropdown (the next date chosen, each option saying how far off it is), then name and email, above the privacy note, with the Turnstile challenge between them and Register. Register stays disabled until the challenge is solved."
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
          questions={['referral', 'experience']}
          upcomingDates={upcomingDates}
        />
      </div>
    </StorySection>

    <StorySection
      description="An event whose region, an ancestor of it, or the atlas fallback runs a mailing list (`offersMailingList`). The opt-in box sits under the fields; ticking it sends `subscribe: yes`, which SahajCloud turns into a linked subscription. Where no list would receive it, the box is absent, as in every section above."
      title="Mailing-list opt-in"
    >
      <div className="max-w-md rounded-lg border border-divider p-4">
        <RegistrationForm
          hasMailingList
          eventId={7}
          eventTitle="Evening Meditation"
          eventUrl="https://atlas.example/e/7"
          isOnline={false}
          questions={[]}
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

    <StorySection
      description="A mistyped address ('anna@gmail') is flagged on its own box as soon as the visitor leaves it: a red border, and 'Enter a valid email' under it, read out with the field. Never a browser bubble — the form sets `noValidate` and checks the address itself. An empty box waits for Register. Here the address comes back from a draft, which is re-checked the same way."
      title="Mistyped email"
    >
      <div className="max-w-md rounded-lg border border-divider p-4">
        <RegistrationForm
          eventId={MISTYPED_EMAIL_EVENT}
          eventTitle="Evening Meditation"
          eventUrl="https://atlas.example/e/9"
          isOnline={false}
          questions={[]}
          upcomingDates={upcomingDates}
        />
      </div>
    </StorySection>

    <StorySection
      description="SahajCloud refused the address (`disposable_email`, naming `senderEmail`). A refusal the visitor can fix lands on the field it names, in the same words the report-an-issue form uses (#259). Live, editing the field clears it; here nothing has been submitted, so react-hook-form does not re-validate on change and the error stays."
      title="Refused · on a field"
    >
      <div className="max-w-md rounded-lg border border-divider p-4">
        <RegistrationForm
          eventId={7}
          eventTitle="Refusal demo"
          eventUrl="https://atlas.example/e/7"
          initialRefusal={new RegistrationRefusedError('disposable_email', '', 'senderEmail')}
          isOnline={false}
          questions={[]}
          upcomingDates={upcomingDates}
        />
      </div>
    </StorySection>

    <StorySection
      description="A refusal about the request rather than an input (`captcha_failed`) gets its own sentence above the buttons, never the generic title or the server's English message."
      title="Refused · the request"
    >
      <div className="max-w-md rounded-lg border border-divider p-4">
        <RegistrationForm
          eventId={8}
          eventTitle="Refusal demo"
          eventUrl="https://atlas.example/e/8"
          initialRefusal={new RegistrationRefusedError('captcha_failed', '')}
          isOnline={false}
          questions={[]}
          upcomingDates={upcomingDates}
        />
      </div>
    </StorySection>

    <StorySection
      description="The post-submit confirmation (RegistrationView puts the class's summary above it). Under the success line: one Add to calendar button opening a menu of calendars, then 'Invite a friend along', open, with the same share block as the class's Share panel, minus the QR code. The calendar block only renders when the view passes export inputs — RegistrationView builds them from the FULL event doc, since the trimmed feed omits exclusions and untilDate."
      title="Confirmation"
    >
      <div className="max-w-md rounded-lg border border-divider p-4">
        <RegistrationForm
          initialSubmitted
          calendar={{
            id: 5,
            title: 'Evening Meditation',
            schedule: weeklySchedule,
            location: '5 Market St, Prague',
            url: 'https://atlas.example/e/5',
          }}
          eventId={5}
          eventTitle="Evening Meditation"
          eventUrl="https://atlas.example/e/5"
          isOnline={false}
          questions={[]}
          upcomingDates={upcomingDates}
        />
      </div>
    </StorySection>

    <StorySection
      description="The same confirmation for an event with no link to give out: no canonical page, on a host page whose anchor the widget declined to take, so it routes off-URL and the address bar names the host's article (issue #115). `eventUrl` is absent, so the invite-a-friend block drops entirely rather than offering a share of somebody else's page — and the calendar entry carries no URL line. The add-to-calendar block still renders: the session is what was registered for, with or without a link."
      title="Confirmation · nothing to link to"
    >
      <div className="max-w-md rounded-lg border border-divider p-4">
        <RegistrationForm
          initialSubmitted
          calendar={{
            id: 6,
            title: 'Evening Meditation',
            schedule: weeklySchedule,
            location: '5 Market St, Prague',
          }}
          eventId={6}
          eventTitle="Evening Meditation"
          isOnline={false}
          questions={[]}
          upcomingDates={upcomingDates}
        />
      </div>
    </StorySection>

    {/* The external-registration CTA belongs to EventRegisterBar, not to this
        form. See the "External" section of the Event Details story, which
        renders the real component, rather than a stand-in button. */}

    <div />
  </StoryWrapper>
)

Default.storyName = 'Registration Form'
