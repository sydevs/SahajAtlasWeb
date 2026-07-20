import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import {
  SearchIcon,
  CloseIcon,
  ShareIcon,
  UpArrowIcon,
  DownArrowIcon,
  RightArrowIcon,
  Logo,
  CalendarIcon,
  LocationIcon,
  CallIcon,
  LanguageIcon,
  EventIcon,
  SocialIcon,
} from './index'

export default {
  title: 'Atoms',
} satisfies StoryDefault

const ICONS = [
  { name: 'SearchIcon', Icon: SearchIcon },
  { name: 'CloseIcon', Icon: CloseIcon },
  { name: 'ShareIcon', Icon: ShareIcon },
  { name: 'UpArrowIcon', Icon: UpArrowIcon },
  { name: 'DownArrowIcon', Icon: DownArrowIcon },
  { name: 'RightArrowIcon', Icon: RightArrowIcon },
  { name: 'Logo', Icon: Logo },
  { name: 'CalendarIcon', Icon: CalendarIcon },
  { name: 'LocationIcon', Icon: LocationIcon },
  { name: 'CallIcon', Icon: CallIcon },
  { name: 'LanguageIcon', Icon: LanguageIcon },
  { name: 'EventIcon', Icon: EventIcon },
] as const

const SOCIAL_PLATFORMS = ['zoom', 'google_meet', 'youtube'] as const

/**
 * Icons — the app's SVG icon set (actions, symbols, records) plus the
 * platform-keyed SocialIcon. Rendered as a labelled gallery at size 28.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection description="The shared SVG icons used across the app." title="Gallery">
      <div className="flex flex-wrap gap-6">
        {ICONS.map(({ name, Icon }) => (
          <div key={name} className="flex w-20 flex-col items-center gap-2 text-center">
            <Icon size={28} />
            <span className="text-xs text-gray-11">{name}</span>
          </div>
        ))}
      </div>
    </StorySection>

    <StorySection description="SocialIcon resolves a glyph from its platform key." title="Socials">
      <div className="flex flex-wrap gap-6">
        {SOCIAL_PLATFORMS.map((platform) => (
          <div key={platform} className="flex w-20 flex-col items-center gap-2 text-center">
            <SocialIcon platform={platform} size={28} />
            <span className="text-xs text-gray-11">{platform}</span>
          </div>
        ))}
      </div>
    </StorySection>

    <StorySection inContext={true} title="Examples">
      <div className="flex flex-col gap-3">
        <span className="flex items-center gap-2 text-gray-12">
          <LocationIcon size={18} />
          London, United Kingdom
        </span>
        <span className="flex items-center gap-2 text-gray-12">
          <CalendarIcon size={18} />
          Every Tuesday, 7:00 PM
        </span>
        <span className="flex items-center gap-2 text-gray-12">
          <CallIcon size={18} />
          +44 20 1234 5678
        </span>
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Icons'
