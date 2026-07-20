import * as React from 'react'

import { BaseIcon } from './base'

import { IconSvgProps } from '@/types'

export const ZoomIcon: React.FC<IconSvgProps> = ({ ...props }) => (
  <BaseIcon
    paths={[
      'M1.45 3.334C.648 3.334 0 3.982 0 4.783v4.986c0 1.6 1.298 2.898 2.898 2.898h6.986c.8 0 1.45-.649 1.45-1.45V6.233a2.9 2.9 0 0 0-2.899-2.899zM16 4.643v6.715c0 .544-.618.86-1.059.539l-2.059-1.498a1.33 1.33 0 0 1-.549-1.078V6.679c0-.427.204-.827.55-1.078l2.058-1.498a.667.667 0 0 1 1.059.54',
    ]}
    size={16}
    view="0 0 16 16"
    {...props}
  />
)

export const GoogleMeetIcon: React.FC<IconSvgProps> = ({ ...props }) => (
  <BaseIcon
    paths={[
      'M6.685 3.724L2 8.436h11.313v7.127H6.685V8.436H2v10.46c0 .762.614 1.38 1.371 1.38h13.142c.757 0 1.37-.618 1.37-1.38v-2.97l3.009 2.48A.686.686 0 0 0 22 17.863V6.252a.686.686 0 0 0-1.122-.533l-2.994 2.469V5.103c0-.762-.614-1.38-1.371-1.38z',
    ]}
    {...props}
  />
)

export const YoutubeIcon: React.FC<IconSvgProps> = ({ ...props }) => (
  <BaseIcon
    paths={[
      'm12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.018-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z',
      'M12 4c.855 0 1.732.022 2.582.058l1.004.048l.961.057l.9.061l.822.064a3.8 3.8 0 0 1 3.494 3.423l.04.425l.075.91c.07.943.122 1.971.122 2.954s-.052 2.011-.122 2.954l-.075.91l-.04.425a3.8 3.8 0 0 1-3.495 3.423l-.82.063l-.9.062l-.962.057l-1.004.048A62 62 0 0 1 12 20a62 62 0 0 1-2.582-.058l-1.004-.048l-.961-.057l-.9-.062l-.822-.063a3.8 3.8 0 0 1-3.494-3.423l-.04-.425l-.075-.91A41 41 0 0 1 2 12c0-.983.052-2.011.122-2.954l.075-.91l.04-.425A3.8 3.8 0 0 1 5.73 4.288l.821-.064l.9-.061l.962-.057l1.004-.048A62 62 0 0 1 12 4m-2 5.575v4.85c0 .462.5.75.9.52l4.2-2.425a.6.6 0 0 0 0-1.04l-4.2-2.424a.6.6 0 0 0-.9.52Z',
    ]}
    {...props}
  />
)

// Online-meeting platform glyphs, keyed for the event detail row's host/location
// icon (see `detectPlatform` in EventDetails). The social-share networks that
// used to live here (Email/Facebook/Twitter/LinkedIn/VK/Flipboard) were dropped
// with the react-share migration (#61) — those targets now render react-share's
// own bundled icons.
const SOCIAL_ICONS: { [key: string]: React.FC<IconSvgProps> } = {
  zoom: ZoomIcon,
  google_meet: GoogleMeetIcon,
  youtube: YoutubeIcon,
}

export function SocialIcon({ platform, ...props }: { platform: string } & IconSvgProps) {
  const SocialIcon = SOCIAL_ICONS[platform]

  return <SocialIcon {...props} />
}
