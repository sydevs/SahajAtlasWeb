import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { ShareContent } from './ShareContent'
import { PlatformButton } from './platform-buttons'

import { platformsForCountry } from '@/lib/share/platforms'

export default { title: 'Molecules' } satisfies StoryDefault

const label = 'Saturday Morning Meditation'
const url = 'https://atlas.example/e/1'

// The regions whose ordering diverges most visibly from the default set.
const REGIONS: { code?: string; name: string }[] = [
  { name: 'Default — unknown region' },
  { code: 'RU', name: 'Russia — VK · OK · Telegram' },
  { code: 'JP', name: 'Japan — LINE first' },
  { code: 'IN', name: 'India — WhatsApp first' },
  { code: 'US', name: 'United States — X · Facebook' },
]

/**
 * ShareContent — a click-to-copy URL field plus region-ordered share targets.
 * On a Web-Share-capable browser the live component leads with a single "Share…"
 * button (the native OS sheet); the "Region ordering" section renders the grids
 * directly so the per-region ordering stays visible whatever the browser supports.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="The copyable URL field and share targets, as used in the drawer."
      title="Share Content"
    >
      <div className="max-w-sm">
        <ShareContent country="US" label={label} url={url} />
      </div>
    </StorySection>

    <StorySection
      description="platformsForCountry reorders the grid to the viewer's region."
      title="Region ordering"
    >
      <div className="flex flex-col gap-4">
        {REGIONS.map(({ code, name }) => (
          <div key={name} className="flex flex-col gap-2">
            <span className="text-xs text-gray-11">{name}</span>
            <div className="flex flex-row flex-wrap gap-3">
              {platformsForCountry(code).map((platform) => (
                <PlatformButton key={platform} platform={platform} title={label} url={url} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Share Content'

/**
 * Playground — flip the `country` control to watch the share grid reorder to that
 * region (an empty value falls back to the universal default set).
 */
export const Playground: Story<{ country: string }> = ({ country }) => (
  <StoryWrapper>
    <StorySection
      description="Pick a viewer country to reorder the targets."
      title="Region control"
    >
      <div className="max-w-sm">
        <ShareContent country={country || undefined} label={label} url={url} />
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Playground.args = { country: 'RU' }
Playground.argTypes = {
  country: {
    control: { type: 'select' },
    options: ['', 'RU', 'BY', 'JP', 'IN', 'BR', 'US', 'DE', 'FR'],
    defaultValue: 'RU',
  },
}
