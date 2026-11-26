import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { Skeleton, SkeletonBlock, SkeletonLine } from './Skeleton'

export default {
  title: 'Atoms',
} satisfies StoryDefault

const TEXT = ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl'] as const

/**
 * Skeleton — the grey shapes a loading state is drawn with. The panel's loading shapes
 * (Views › Panel Skeleton) are built from these. The shapes are hidden from screen readers and
 * pulse unless motion is reduced; the loading state says what it waits for once, in words.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="SkeletonLine takes the text classes of the line it stands for, so it is exactly that line's height and the content lands where the bar was. Each bar sits beside the text it stands in for."
      title="Lines"
    >
      <div className="grid max-w-xl grid-cols-[auto_1fr_1fr] items-start gap-x-6 gap-y-2">
        {TEXT.map((size) => (
          <div key={size} className="contents">
            <code className="text-xs text-gray-11">{size}</code>
            <Skeleton className="border-y border-dashed border-divider">
              <SkeletonLine className={size} width="w-3/4" />
            </Skeleton>
            <div className={`border-y border-dashed border-divider ${size}`}>
              Evening meditation
            </div>
          </div>
        ))}
      </div>
    </StorySection>

    <StorySection
      description="SkeletonBlock is any other shape — a flag's circle, a chip, a button — sized by the caller, with the 8px corner unless it says otherwise."
      title="Blocks"
    >
      <Skeleton className="flex max-w-md items-center gap-3">
        <SkeletonBlock className="h-6 w-6 rounded-full" />
        <SkeletonBlock className="h-5 w-24" />
        <SkeletonBlock className="h-10 flex-1" />
        <SkeletonBlock className="h-12 w-12 rounded-full" />
      </Skeleton>
    </StorySection>

    <StorySection
      description="One Skeleton around a group pulses the group as one. It must be a real box: a contents wrapper draws nothing for the pulse to fade."
      title="A group"
    >
      <Skeleton className="flex max-w-md flex-col gap-2 rounded-lg border border-divider p-4">
        <SkeletonLine className="text-lg" width="w-3/5" />
        <SkeletonLine className="text-sm" width="w-1/2" />
        <SkeletonLine className="text-sm" width="w-1/3" />
      </Skeleton>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Skeleton'
