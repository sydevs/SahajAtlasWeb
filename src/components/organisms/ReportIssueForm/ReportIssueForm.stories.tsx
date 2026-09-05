import type { Story, StoryDefault } from '@ladle/react'
import type { ReportContext } from '@/lib/report'

import { type ReactNode, useState } from 'react'

// This is not in the organisms barrel — only the ReportIssueModal host is.
// Import from the co-located file instead.
import { StoryWrapper, StorySection } from '../../ladle'

import { ReportIssueForm } from './ReportIssueForm'

import { Button } from '@/components/atoms/Button'
import { Modal, ModalContent } from '@/components/atoms/Modal'

export default { title: 'Organisms' } satisfies StoryDefault

// This is what the ReportIssueModal host would have assembled — the fields
// a viewer never types. It appears here, so the story previews the real
// payload's shape.
const context: ReportContext = {
  path: '/india/pune/e/42',
  pageUrl: 'https://sahajayoga.example/find-a-class',
  locale: 'en',
  client: 'Sahaja Yoga UK',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
}

const noop = () => {}

// This is the panel the modal supplies in the app, so the inline sections
// below show the form at the width and on the surface it actually renders
// against.
function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="flex max-w-md flex-col overflow-hidden rounded-2xl border border-divider bg-background">
      {children}
    </div>
  )
}

/**
 * ReportIssueForm is the report-issue form, rendered inside the Modal atom
 * (issues #79 and #103). It has an optional reply address, the message, and
 * a Cloudflare Turnstile challenge, over the auto-attached context the
 * viewer never types.
 *
 * The live sections render a REAL Turnstile widget against Cloudflare's
 * always-passes test site key, so submit becomes enabled once the message
 * is long enough. Submitting now performs a real `POST /api/contact-admin`.
 * Ladle carries no API key, so it comes back refused, and you land on the
 * failure state. That is the honest outcome, and the point of the ticket:
 * the thank-you screen shows only for a delivered message.
 */
export const Default: Story = () => {
  const [open, setOpen] = useState(false)

  return (
    <StoryWrapper>
      <StorySection
        description="The live form. Submit stays disabled until the message reaches 10 characters AND Turnstile has produced a token."
        title="Default"
      >
        <Panel>
          <ReportIssueForm context={context} onClose={noop} />
        </Panel>
      </StorySection>

      <StorySection
        description="Seeded with a too-short message and a malformed address: each field shows its own inline error, tied to the control with aria-describedby, and submit stays disabled."
        title="Validation errors"
      >
        <Panel>
          <ReportIssueForm
            context={context}
            initialValues={{ email: 'not-an-email', message: 'too short' }}
            onClose={noop}
          />
        </Panel>
      </StorySection>

      <StorySection
        description="When the challenge can't load, the form says so and leaves Send disabled — there is no token to send. Rare in practice, since a widget that cannot run the challenge at all fails before a viewer reaches this form."
        title="Captcha blocked"
      >
        <Panel>
          <ReportIssueForm captchaUnavailable context={context} onClose={noop} />
        </Panel>
      </StorySection>

      <StorySection
        description="A send that failed. The message and address stay put so the retry costs nothing to compose, and the challenge has been reset underneath — a solved challenge is single-use, so a retry needs a fresh one."
        title="Send failed"
      >
        <Panel>
          <ReportIssueForm initialFailed context={context} onClose={noop} />
        </Panel>
      </StorySection>

      <StorySection
        description="After a DELIVERED report — this screen is derived from the mutation's success and nothing else. The modal unmounts its content on close, so reopening always starts on a fresh form with a new challenge."
        title="Thank you"
      >
        <Panel>
          <ReportIssueForm initialSubmitted context={context} onClose={noop} />
        </Panel>
      </StorySection>

      <StorySection
        description="The same form in the real Modal — the chrome, the portal into the themed root, and the Esc / backdrop / × dismissals the app ships."
        title="In the modal"
      >
        <div className="flex h-32 items-center justify-center">
          <Button color="primary" onClick={() => setOpen(true)}>
            Report an issue
          </Button>
        </div>

        <Modal open={open} onOpenChange={setOpen}>
          <ModalContent
            closeLabel="Close"
            description="Tell us what's wrong and we'll pass it on to the team."
            title="Report an issue"
          >
            <ReportIssueForm context={context} onClose={() => setOpen(false)} />
          </ModalContent>
        </Modal>
      </StorySection>
    </StoryWrapper>
  )
}

Default.storyName = 'Report Issue Form'
