import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { Link } from './Link'

export default {
  title: 'Atoms',
} satisfies StoryDefault

/**
 * Link — a styled link. Internal targets route through react-router; external
 * ones render a plain anchor with a safe rel and an optional new-tab glyph.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="Colour variants (governed by the global link-colour rule)."
      title="Colours"
    >
      <div className="flex flex-wrap items-center gap-4">
        <Link color="neutral" href="/">
          Default
        </Link>
        <Link color="foreground" href="/">
          Foreground
        </Link>
        <Link color="primary" href="/">
          Primary
        </Link>
        <Link color="contrast" href="/">
          Danger
        </Link>
      </div>
    </StorySection>

    <StorySection title="External (new tab)">
      <Link isExternal showAnchorIcon href="https://example.com">
        Opens in a new tab
      </Link>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Link'
