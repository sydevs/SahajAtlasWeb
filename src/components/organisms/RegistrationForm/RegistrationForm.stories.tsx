import type { Story, StoryDefault } from '@ladle/react'
import type { EventSchedule } from '@/types'

import { useState } from 'react'

// This is not in the organisms barrel — it is reached only via the
// RegistrationView drawer. Import from the co-located file instead.
import { StoryWrapper, StorySection } from '../../ladle'

import { RegistrationForm } from './RegistrationForm'

import { RegistrationRefusedError } from '@/config/api/mutate'
import { useRegistrationDraft } from '@/config/store'

export default { title: 'Organisms' } satisfies StoryDefault

// A week out and two weeks out, so the date options read "Next week" and "In 2 weeks" whenever
// the playground is opened.
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const upcomingDates = [new Date(Date.now() + WEEK_MS), new Date(Date.now() + 2 * WEEK_MS)]

const MISTYPED_ID = 9

/** A form restored from a draft holding `anna@gmail`, as a drawer remount restores one. */
function MistypedEmail() {
  // Seeded before the form's first render, which reads the draft once.
  useState(() =>
    useRegistrationDraft
      .getState()
      .setDraft(MISTYPED_ID, { name: 'Anna Novak', email: 'anna@gmail' }),
  )

  return (
    <RegistrationForm
      eventId={MISTYPED_ID}
      eventTitle="Mistyped email demo"
      isOnline={false}
      questions={[]}
      recurrenceType="WEEKLY"
      upcomingDates={upcomingDates}
    />
  )
}

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
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="The native form as it renders in the drawer body: the first class as a dropdown on the next date, name and email, the privacy note, and one full-width Register. In the drawer, Register renders in the footer and stays on screen; here it ends the form. It stays disabled until the security check passes, with the line under it saying why."
      title="Native"
    >
      <div className="max-w-md rounded-lg border border-divider p-4">
        <RegistrationForm
          eventId={1}
          eventTitle="Saturday Morning Meditation"
          eventUrl="https://atlas.example/e/1"
          isOnline={false}
          questions={[]}
          recurrenceType="WEEKLY"
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
      description="An address without its ending is flagged on its own box as soon as the visitor leaves it, before Register. This one is restored from a draft, the way a drawer remount restores one, and comes back flagged. An empty box waits for Register."
      title="Mistyped email"
    >
      <div className="max-w-md rounded-lg border border-divider p-4">
        <MistypedEmail />
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
      description="A refusal about the request rather than an input (`captcha_failed`) gets its own sentence above Register, never the generic title or the server's English message."
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
      description="The post-submit confirmation. Live, its first line names the date chosen in the visitor's format and the next the email address; previewed without a submission, it says the confirmation was sent. Under it, the Add to calendar menu (only when the view passes export inputs, built from the FULL event doc) and Invite a friend along, open, with the share block: Share and Copy link, no QR code."
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
