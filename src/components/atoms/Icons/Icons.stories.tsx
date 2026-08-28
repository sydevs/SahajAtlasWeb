import type { Story, StoryDefault } from '@ladle/react'

import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Funnel,
  Globe,
  Info,
  Languages,
  LoaderCircle,
  MapPin,
  Menu,
  Monitor,
  Navigation,
  Pause,
  PhoneOutgoing,
  Search,
  Settings,
  Share,
  SquarePlay,
  Video,
  X,
} from 'lucide-react'

import { StoryWrapper, StorySection } from '../../ladle'

import { Logo, SocialIcon } from './index'

export default {
  title: 'Atoms',
} satisfies StoryDefault

// The interface set, as the app uses it. All Lucide: one 24px grid, 2px stroke, round
// caps and joins, outline only — which is the point of the swap. Named for the glyph
// rather than the job, so a second use of the same shape doesn't need a second name.
const ICONS = [
  { name: 'Search', Icon: Search },
  { name: 'X', Icon: X },
  { name: 'Share', Icon: Share },
  { name: 'ChevronRight', Icon: ChevronRight },
  { name: 'ChevronDown', Icon: ChevronDown },
  { name: 'CalendarDays', Icon: CalendarDays },
  { name: 'MapPin', Icon: MapPin },
  { name: 'PhoneOutgoing', Icon: PhoneOutgoing },
  { name: 'Languages', Icon: Languages },
  { name: 'Monitor', Icon: Monitor },
  { name: 'Globe', Icon: Globe },
  { name: 'Navigation', Icon: Navigation },
  { name: 'Funnel', Icon: Funnel },
  { name: 'Menu', Icon: Menu },
  { name: 'Settings', Icon: Settings },
  { name: 'Info', Icon: Info },
  { name: 'Check', Icon: Check },
  { name: 'ArrowUpRight', Icon: ArrowUpRight },
  { name: 'Pause', Icon: Pause },
  { name: 'SquarePlay', Icon: SquarePlay },
  { name: 'Video', Icon: Video },
  { name: 'LoaderCircle', Icon: LoaderCircle },
] as const

const SOCIAL_PLATFORMS = ['zoom', 'google_meet', 'youtube'] as const

// Every icon is drawn with `currentColor`, so it inherits the surrounding text
// color — one glyph serves every palette role. `text-{role}-11` is the readable
// on-surface step for the brand roles; neutral text uses `text-gray-12`.
const PALETTE = [
  { name: 'primary', className: 'text-primary-11' },
  { name: 'secondary', className: 'text-secondary-11' },
  { name: 'contrast', className: 'text-contrast-11' },
  { name: 'neutral', className: 'text-gray-12' },
] as const

/**
 * Icons — the Lucide interface set the app draws with, plus the brand marks that stay
 * ours (Lucide ships no brand icons). Rendered as a labelled gallery at size 28.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="The Lucide glyphs used across the app — one grid, one stroke weight, outline only."
      title="Gallery"
    >
      <div className="flex flex-wrap gap-6">
        {ICONS.map(({ name, Icon }) => (
          <div key={name} className="flex w-24 flex-col items-center gap-2 text-center">
            <Icon size={28} />
            <span className="text-xs text-gray-11">{name}</span>
          </div>
        ))}
      </div>
    </StorySection>

    <StorySection
      description="Kept hand-drawn: Lucide removed its brand icons, and redrawing them is a trademark problem. SocialIcon resolves a glyph from its platform key."
      title="Brand marks"
    >
      <div className="flex flex-wrap gap-6">
        <div className="flex w-24 flex-col items-center gap-2 text-center">
          <Logo size={28} />
          <span className="text-xs text-gray-11">Logo</span>
        </div>
        {SOCIAL_PLATFORMS.map((platform) => (
          <div key={platform} className="flex w-24 flex-col items-center gap-2 text-center">
            <SocialIcon platform={platform} size={28} />
            <span className="text-xs text-gray-11">{platform}</span>
          </div>
        ))}
      </div>
    </StorySection>

    <StorySection
      description="Icons are drawn with `currentColor`, so they take the text color of whatever they sit in — the same glyph on each palette role. Lucide strokes with it where our own marks fill with it; both inherit."
      inContext={true}
      title="Colour inheritance"
    >
      <div className="flex flex-col gap-3">
        {PALETTE.map(({ name, className }) => (
          <span key={name} className={`flex items-center gap-2 ${className}`}>
            <CalendarDays size={18} />
            <MapPin size={18} />
            <Languages size={18} />
            <Logo size={18} />
            <span className="text-sm font-medium">{name}</span>
          </span>
        ))}
      </div>
    </StorySection>

    <StorySection
      description="Directional glyphs mirror under RTL. Lucide has no equivalent of the old `flipRtl`, so each directional call site carries `rtl:-scale-x-100` itself."
      inContext={true}
      title="Direction"
    >
      <div className="flex items-center gap-6" dir="rtl">
        <ChevronRight className="rtl:-scale-x-100" size={24} />
        <Navigation className="rtl:-scale-x-100" size={24} />
        <span className="text-sm text-gray-11">dir=&quot;rtl&quot;</span>
      </div>
    </StorySection>

    <StorySection inContext={true} title="Examples">
      <div className="flex flex-col gap-3">
        <span className="flex items-center gap-2 text-gray-12">
          <MapPin size={18} />
          London, United Kingdom
        </span>
        <span className="flex items-center gap-2 text-gray-12">
          <CalendarDays size={18} />
          Every Tuesday, 7:00 PM
        </span>
        <span className="flex items-center gap-2 text-gray-12">
          <PhoneOutgoing size={18} />
          +44 20 1234 5678
        </span>
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Icons'
