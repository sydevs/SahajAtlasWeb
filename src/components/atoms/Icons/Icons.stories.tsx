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
  Milestone,
  Monitor,
  Moon,
  Pause,
  PhoneOutgoing,
  Play,
  Search,
  Settings,
  Share,
  Sun,
  X,
} from 'lucide-react'

import { StoryWrapper, StorySection } from '../../ladle'

import { Logo, SocialIcon } from './index'

import { Button } from '@/components/atoms/Button'

export default {
  title: 'Atoms',
} satisfies StoryDefault

/**
 * The gallery shows the icons the app ACTUALLY RENDERS. It is not a curated
 * subset of Lucide, and not a wishlist. Adding an icon here without a call
 * site would turn this page into a second, worse copy of the Lucide
 * catalogue. It would go stale the moment Lucide ships anything, and it
 * would invite picking a glyph from our page instead of the 2,000 upstream.
 * So the rule runs one way: an icon earns its row by being used, and the
 * button below covers everything else.
 *
 * ⚠ Keep this list in step with the imports in app code, excluding stories
 * and tests. Watch `Video` and `Calendar`. Both appear in `Chip.stories.tsx`
 * only, so neither belongs here.
 */
const ICONS = [
  { name: 'ArrowUpRight', Icon: ArrowUpRight },
  { name: 'CalendarDays', Icon: CalendarDays },
  { name: 'Check', Icon: Check },
  { name: 'ChevronDown', Icon: ChevronDown },
  { name: 'ChevronRight', Icon: ChevronRight },
  { name: 'Funnel', Icon: Funnel },
  { name: 'Globe', Icon: Globe },
  { name: 'Info', Icon: Info },
  { name: 'Languages', Icon: Languages },
  { name: 'LoaderCircle', Icon: LoaderCircle },
  { name: 'MapPin', Icon: MapPin },
  { name: 'Menu', Icon: Menu },
  { name: 'Milestone', Icon: Milestone },
  { name: 'Monitor', Icon: Monitor },
  { name: 'Moon', Icon: Moon },
  { name: 'Pause', Icon: Pause },
  { name: 'PhoneOutgoing', Icon: PhoneOutgoing },
  { name: 'Play', Icon: Play },
  { name: 'Search', Icon: Search },
  { name: 'Settings', Icon: Settings },
  { name: 'Share', Icon: Share },
  { name: 'Sun', Icon: Sun },
  { name: 'X', Icon: X },
] as const

const SOCIAL_PLATFORMS = ['zoom', 'google_meet', 'youtube'] as const

// Every icon is drawn with `currentColor`, so it inherits the surrounding
// text color. One glyph serves every palette role. `text-{role}-11` is the
// readable on-surface step for the brand roles. Neutral text uses `text-gray-12`.
const PALETTE = [
  { name: 'primary', className: 'text-primary-11' },
  { name: 'secondary', className: 'text-secondary-11' },
  { name: 'contrast', className: 'text-contrast-11' },
  { name: 'neutral', className: 'text-gray-12' },
] as const

/**
 * Icons — the Lucide glyphs the app renders, plus the brand marks that stay
 * ours. (Lucide ships no brand icons.) This renders as a labelled gallery at
 * size 28.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="Every Lucide glyph the app renders today — one grid, one stroke weight, outline only. This list is the app's usage, not a selection: an icon appears here once something imports it."
      title="Gallery"
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-6">
          {ICONS.map(({ name, Icon }) => (
            <div key={name} className="flex w-24 flex-col items-center gap-2 text-center">
              <Icon size={28} />
              <span className="text-xs text-gray-11">{name}</span>
            </div>
          ))}
        </div>

        {/* Reaching for a glyph the app does not use yet is the common case. The
            answer is upstream, not a longer list here. See the docblock on ICONS. */}
        <div className="flex flex-col items-start gap-2">
          <Button
            href="https://lucide.dev/icons/"
            rel="noopener noreferrer"
            size="sm"
            target="_blank"
            variant="bordered"
          >
            Browse all Lucide icons
            <ArrowUpRight size={16} />
          </Button>
          <p className="text-xs text-gray-11">
            Need one that isn&apos;t here? Take it from the full catalogue, then add it to this
            gallery in the same change that first uses it.
          </p>
        </div>
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
        <Milestone className="rtl:-scale-x-100" size={24} />
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
