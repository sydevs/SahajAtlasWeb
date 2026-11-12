import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { ShareContent } from './ShareContent'
import { ShareTargets } from './platform-buttons'

import { panelChrome } from '@/components/atoms/Select'

export default { title: 'Molecules' } satisfies StoryDefault

const label = 'Saturday Morning Meditation'
const url = 'https://atlas.example/e/1'

// The regions whose targets differ most visibly from the default set.
const REGIONS: { code?: string; name: string }[] = [
  { name: 'Default — unknown region' },
  { code: 'RU', name: 'Russia — VK · OK · Telegram' },
  { code: 'JP', name: 'Japan — LINE first' },
  { code: 'IN', name: 'India — WhatsApp first' },
  { code: 'US', name: 'United States — X · Facebook' },
]

/**
 * ShareContent — the one share block, on the class's Share panel and the registration
 * confirmation. Share opens the device's own share sheet (Safari, and phones); where there is
 * none, as in desktop Chrome, it opens the region's targets in a popover instead. Copy link says
 * "Link copied" on the button itself. Only the Share panel adds the QR code.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="As on the registration confirmation. Press Share: a browser with a share sheet opens it; any other opens the targets in a popover."
      title="Share Content"
    >
      <div className="max-w-sm">
        <ShareContent country="US" label={label} url={url} />
      </div>
    </StorySection>

    <StorySection
      description="As on the class's Share panel: the same block, plus the QR code for posters."
      title="With the QR code"
    >
      <div className="max-w-sm">
        <ShareContent qr country="US" label={label} url={url} />
      </div>
    </StorySection>

    <StorySection
      description="What the Share button's popover holds where there is no share sheet: the region's networks, each in its brand colours."
      title="Fallback popover"
    >
      <div className={panelChrome({ class: 'w-max max-w-full p-3' })}>
        <ShareTargets country="GB" title={label} url={url} />
      </div>
    </StorySection>

    <StorySection
      description="platformsForCountry picks and orders the targets to the viewer's region."
      title="Region ordering"
    >
      <div className="flex flex-col gap-4">
        {REGIONS.map(({ code, name }) => (
          <div key={name} className="flex max-w-sm flex-col gap-2">
            <span className="text-xs text-gray-11">{name}</span>
            <ShareTargets country={code} title={label} url={url} />
          </div>
        ))}
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Share Content'
