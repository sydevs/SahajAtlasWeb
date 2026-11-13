import type { Story, StoryDefault } from '@ladle/react'

import { StorySection, StoryWrapper } from '../../ladle'

import { CopyFallback } from './CopyFallback'

import { panelChrome } from '@/components/atoms/Select'

export default { title: 'Molecules' } satisfies StoryDefault

const url = 'https://atlas.example/calendar?region=gb&view=list&dates=2026-11-13..2026-11-19'

/**
 * CopyFallback — what Copy link shows when the clipboard refuses it: the reason, and the whole
 * link, selected for a copy by hand. The class's Share block shows it under Copy link; the
 * calendar's week Share shows it in a popover, since that button has no room below it.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection description="Under the Copy link button." title="Copy Fallback">
      <div className="flex max-w-sm flex-col gap-2">
        <CopyFallback url={url} />
      </div>
    </StorySection>

    <StorySection description="In the week Share button's popover." title="In a popover">
      <div className={panelChrome({ class: 'flex w-72 flex-col gap-2 p-3' })}>
        <CopyFallback url={url} />
      </div>
    </StorySection>
  </StoryWrapper>
)

Default.storyName = 'Copy Fallback'
