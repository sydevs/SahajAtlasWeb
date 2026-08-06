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
 * **What this covers that nothing else does.** The per-view stories each throw the ONE
 * kind their view actually reaches — `server` (Countries), `offline` (Search), the
 * not-found flavours (Region/Online/Event/Registration/Share) — which leaves `config`,
 * `contract` and `unknown` with no drawer-width case at all. Those three are exactly the
 * rows whose only control is "Report an issue", so they are where "did we strand the
 * viewer?" is answered. This is also the only place all six can be flipped through on one
 * axis, against the same chrome, which is how a register or a button-set drifting between
 * them becomes visible.
 *
 * The overlap with the view stories is real and deliberate: they prove each view keeps ITS
 * header through a throw; this proves the six kinds differ from each other.
 *
 * What to compare case by case is the CONTROLS, not the sentence — `mockErrorNotes`
 * (src/mocks/errors.ts) says what each is meant to prove, and the app-level twin of this
 * story (Molecules › Fallbacks) reads the same notes over the same fixtures. That twin
 * additionally carries the empty-list rows, which never reach a boundary.
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
