import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { LoadingFallback, ErrorFallback } from './Fallbacks'

import { mockErrorKinds, mockErrorNotes, mockErrors } from '@/mocks/errors'

export default {
  title: 'Molecules',
} satisfies StoryDefault

/**
 * Fallbacks — the suspense and error-boundary placeholders used while panels load or
 * fail. LoadingFallback shows a spinner; ErrorFallback classifies what was thrown and
 * offers only the actions that can help (issue #89).
 *
 * Every kind renders from the same fixtures the drawer's "Error States" story uses, so
 * the app-level and drawer surfaces can't drift on what a given failure offers — they
 * differ only in chrome. This is the whole-widget screen (what shows when the app fails
 * to boot at all, e.g. an embed with no API key); the drawer's is a body.
 *
 * `resetErrorBoundary` is passed here as the real boundary does, so the retry renders
 * wherever the policy allows it. The thrown developer string appears in none of them.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection description="Shown via Suspense while a panel's data loads." title="Loading">
      <div className="h-64 w-full">
        <LoadingFallback />
      </div>
    </StorySection>

    <StorySection
      description="Rendered by the error boundary when a fetch or render throws — one section per failure kind."
      title="Error"
    >
      {mockErrorKinds.map((kind) => (
        <StorySection
          key={kind}
          description={mockErrorNotes[kind]}
          title={kind}
          variant="subsection"
        >
          <div className="h-64 w-full">
            <ErrorFallback error={mockErrors[kind]} resetErrorBoundary={() => {}} />
          </div>
        </StorySection>
      ))}
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Fallbacks'
