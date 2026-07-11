import type { Story, StoryDefault } from '@ladle/react'
import type { DetailRowBox } from './DetailRow'

import { StoryWrapper, StorySection } from '../../ladle'

import { DetailRow } from './DetailRow'

import { CallIcon, LocationIcon } from '@/components/atoms/Icons'

export default { title: 'Molecules' } satisfies StoryDefault

// The two leading-box shapes, as the event detail cards use them: a framed icon
// (location, host contact) and a split top/bottom date badge (timing).
const iconBox: DetailRowBox = { kind: 'icon', icon: <LocationIcon /> }
const phoneBox: DetailRowBox = { kind: 'icon', icon: <CallIcon size={32} /> }
const dateBox: DetailRowBox = { kind: 'split', top: 'MAR', bottom: 18 }

/**
 * DetailRow — a generic labelled row: a leading square box (a framed icon or a
 * split top/bottom badge) then a title over secondary content. The title is plain
 * text, or an internal/external link via `url`/`isExternal`. The `box` prop models
 * the two shapes explicitly; `tone` owns the icon box's tint — `icon` (default),
 * `highlight` (filled), or `plain` (the split badge supplies its own colours). The
 * event detail cards (timing, location, host contact) build on it.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="The title is plain, an internal link, or an external link."
      title="Variants"
    >
      <div className="flex max-w-md flex-col gap-6">
        <StorySection title="Plain (no link)" variant="subsection">
          <DetailRow box={iconBox} content="123 Peace Street, London" title="Meditation Centre" />
        </StorySection>

        <StorySection title="Internal link" variant="subsection">
          <DetailRow
            box={iconBox}
            content="See the venue page"
            title="Cambridge Centre"
            url="#venue"
          />
        </StorySection>

        <StorySection title="External link (isExternal)" variant="subsection">
          <DetailRow
            isExternal
            box={phoneBox}
            content="Call +44 20 1234 5678"
            title="Contact the host"
            url="tel:+442012345678"
          />
        </StorySection>
      </div>
    </StorySection>

    <StorySection
      description="`box` sets the leading shape (a framed icon or a split date badge); `tone` sets the icon box's appearance: a tinted icon (default), the brand-filled highlight (the emphasised contact card), or an untinted frame."
      title="Box & tone"
    >
      <div className="flex max-w-md flex-col gap-6">
        <StorySection title="icon (default tone)" variant="subsection">
          <DetailRow box={iconBox} content="123 Peace Street, London" title="Meditation Centre" />
        </StorySection>

        <StorySection title="icon — highlight" variant="subsection">
          <DetailRow
            isExternal
            box={phoneBox}
            content="Call for the next class time"
            title="Contact for timing"
            tone="highlight"
            url="tel:+442012345678"
          />
        </StorySection>

        <StorySection title="split (date badge, plain tone)" variant="subsection">
          <DetailRow
            box={dateBox}
            content="Every Tuesday, 7:00 PM"
            title="Weekly class"
            tone="plain"
          />
        </StorySection>
      </div>
    </StorySection>

    <StorySection inContext={true} title="Examples">
      <div className="flex max-w-md flex-col gap-4">
        <DetailRow
          box={dateBox}
          content="Every Tuesday, 7:00 PM"
          title="Weekly class"
          tone="plain"
        />
        <DetailRow
          isExternal
          box={iconBox}
          content="123 Peace Street, London"
          title="Meditation Centre"
          url="#venue"
        />
        <DetailRow
          isExternal
          box={phoneBox}
          content="Call +44 20 1234 5678"
          title="Contact the host"
          url="tel:+442012345678"
        />
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Detail Row'
