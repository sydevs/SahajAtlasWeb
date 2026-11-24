import { useMediaQuery } from 'react-responsive'

// Shri Mataji teaching, from https://shrimataji.org/reading-room/
import hostBannerPhoto from '../class-page/host-banner.webp'

const bannerSizes = {
  short: {
    desktopCrop: '0 7 798 182',
    mobileCrop: '76 14 640 340',
    mobileClass:
      'block h-[clamp(100px,30vw,144px)] w-full overflow-hidden sm:aspect-[4.25/1] sm:h-auto',
  },
  tall: {
    desktopCrop: '0 0 798 260',
    mobileCrop: '76 10 640 340',
    mobileClass:
      'block h-[clamp(132px,25svh,176px)] w-full overflow-hidden sm:aspect-[4/1] sm:h-auto',
  },
}

export type BannerHeight = keyof typeof bannerSizes
export function HostBanner({ height = 'short' }: { height?: BannerHeight }) {
  const desktop = useMediaQuery({ minWidth: 960 })
  const crop = bannerSizes[height]

  return (
    <svg
      aria-label="Shri Mataji Nirmala Devi teaching Sahaja Yoga meditation"
      className={desktop ? 'block h-auto w-full overflow-hidden rounded-xl' : crop.mobileClass}
      preserveAspectRatio="xMidYMin slice"
      role="img"
      viewBox={desktop ? crop.desktopCrop : crop.mobileCrop}
    >
      <image height={350} href={hostBannerPhoto} width={990} />
    </svg>
  )
}
