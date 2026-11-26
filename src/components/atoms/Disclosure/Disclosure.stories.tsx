import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { Disclosure } from './Disclosure'

export default { title: 'Atoms' } satisfies StoryDefault

/** Disclosure — a closed row that opens to show more. The panel mounts only when opened. */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection description="Closed by default, and opened." title="Closed and open">
      <div className="flex w-full max-w-md flex-col">
        <Disclosure title="Closed row">
          <p className="text-sm text-gray-11">This mounts only once the row is opened.</p>
        </Disclosure>
        <Disclosure defaultOpen title="Open row">
          <p className="text-sm text-gray-11">This row started open.</p>
        </Disclosure>
      </div>
    </StorySection>
  </StoryWrapper>
)
Default.storyName = 'Disclosure'
