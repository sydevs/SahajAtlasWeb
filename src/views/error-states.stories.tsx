import type { Story, StoryDefault } from '@ladle/react'
import type { ErrorKind } from '@/lib/report'

import { Thrower, ViewHarness } from '@/views/story-harness'
import { mockErrorKinds, mockErrors } from '@/mocks/errors'

export default { title: 'Views' } satisfies StoryDefault

/**
 * Error States — every failure kind as the DRAWER renders it (issue #89):
 * DrawerErrorFallback at drawer width, driven by throwing the real value inside the
 * boundary, so `classifyError` decides the case rather than a kind being handed to a
 * component that trusts it.
 *
 * What to compare case by case is the BUTTONS, not the sentence — `mockErrorNotes`
 * (src/mocks/errors.ts) says what each is meant to prove, and the app-level twin of this
 * story (Molecules › Fallbacks) reads the same notes over the same fixtures.
 *
 * No case shows the thrown developer string: it's untranslated text written for us, and
 * it survives as report context only.
 */
export const Default: Story<{ kind: ErrorKind }> = ({ kind }) => (
  <ViewHarness seedKey={kind}>
    <Thrower error={mockErrors[kind]} />
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
