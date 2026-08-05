import type { Story, StoryDefault } from '@ladle/react'
import type { ErrorKind } from '@/lib/report'

import { ViewHarness } from '@/views/story-harness'
import { mockErrorKinds, mockErrors } from '@/mocks/errors'

export default { title: 'Views' } satisfies StoryDefault

/**
 * Error States — every failure kind as the DRAWER renders it (issue #89):
 * DrawerErrorFallback at drawer width, driven through the harness's `throws` escape so
 * the real thrown value goes through `classifyError`, rather than a kind being handed to
 * a component that trusts it.
 *
 * What to check case by case is the BUTTONS, not the sentence:
 *
 * - **offline** — Try again only. No report: connectivity isn't ours to fix, and the
 *   report POST (#80) needs the very network that just failed.
 * - **server** — Try again, with the report CTA beneath it.
 * - **not-found** — See nearby events only; retrying a dead link fails identically.
 * - **config** — Report only. A misconfigured embed needs a human, not a press.
 * - **contract** — Report only. SahajCloud's shape drifted from ours.
 * - **unknown** — Try again + report, the catch-all.
 *
 * No case shows the thrown developer string — it's untranslated text written for us, and
 * it survives as report context only.
 */
export const Default: Story<{ kind: ErrorKind }> = ({ kind }) => (
  <ViewHarness seed={() => {}} seedKey={kind} throws={mockErrors[kind]}>
    {/* Never rendered — `throws` short-circuits the harness to its thrower. */}
    <div />
  </ViewHarness>
)

Default.storyName = 'Error States'
Default.meta = { width: 'xsmall' }
Default.args = { kind: 'offline' }
Default.argTypes = {
  kind: {
    name: 'Kind',
    options: mockErrorKinds,
    control: { type: 'radio' },
    defaultValue: 'offline',
  },
}
