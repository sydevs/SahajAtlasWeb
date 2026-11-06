import clsx from 'clsx'

import locationPin from './location_pin.svg?raw'
import lotusLogo from './lotus_logo.svg?raw'
import meditate from './meditate.svg?raw'
import moon from './moon.svg?raw'
import sunrise from './sunrise.svg?raw'

// The We Meditate app's own line icons, so the Atlas reads as part of the same family.
//
// Origin: the `.svg` files beside this one are copied UNCHANGED from
// `wemeditate-design-system/assets/icons/` (commit b7c717b, 2026-10-29), which in turn
// copies them unchanged from the WeMeditate app (`AppTheme.icons`). Same organisation,
// same licence. To update one, copy the new file over it; never hand-edit the SVG.
//
// The files carry the app's own paint (a dark stroke, a yellow or blue fill), so they
// are recoloured at module load rather than edited: every literal colour becomes
// `currentColor`, which lets the call site pick the colour with a text utility
// (`text-ornament`, the warm coral). Their clip-path ids are namespaced too — each file
// uses `id="a"`, and two inline SVGs with the same id on one page would clip each other.
//
// Use them sparingly, where they add warmth: the online row, empty states, the location
// and time facts, the "free" line. Interface controls stay on lucide.
const SOURCES = {
  meditate,
  'location-pin': locationPin,
  sunrise,
  moon,
  lotus: lotusLogo,
} as const

export type WmIconName = keyof typeof SOURCES

// `sunrise` draws a half sun on the horizon in the middle band of a 68×68 square, so at
// icon size it would render as a sliver. Its viewBox is cropped to the drawing here,
// rather than editing the file.
const VIEWBOX: Partial<Record<WmIconName, string>> = {
  sunrise: '0 9 68 50',
}

const prepare = (name: WmIconName, svg: string, tone: WmIconTone) => {
  // Literal paints only — `none` and `currentColor` pass through. The app tone keeps them.
  const painted =
    tone === 'current'
      ? svg.replace(/(fill|stroke)="#[0-9a-fA-F]{3,8}"/g, '$1="currentColor"')
      : svg
  let out = painted
    .replace(/id="([^"]+)"/g, `id="sy-wm-${name}-${tone}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#sy-wm-${name}-${tone}-$1)`)
    // The span sizes the icon, so the root's own pixel size is dropped.
    .replace(/<svg([^>]*?)\swidth="[^"]*"/, '<svg$1')
    .replace(/<svg([^>]*?)\sheight="[^"]*"/, '<svg$1')
    .replace('<svg', '<svg aria-hidden="true" focusable="false"')

  const viewBox = VIEWBOX[name]

  if (viewBox) out = out.replace(/viewBox="[^"]*"/, `viewBox="${viewBox}"`)

  return out
}

/**
 * `current` draws the icon in the text colour. `app` keeps the app's own paint (the sunrise's
 * yellow, the moon's blue), as the app's reminder sheet shows them: Anton wanted that colour on
 * the time-of-day filter (6 Nov).
 */
export type WmIconTone = 'current' | 'app'

// Prepared once, at module load: the sources are static, so nothing re-parses per render.
const prepareAll = (tone: WmIconTone) =>
  Object.fromEntries(
    Object.entries(SOURCES).map(([name, svg]) => [name, prepare(name as WmIconName, svg, tone)]),
  ) as Record<WmIconName, string>
const MARKUP: Record<WmIconTone, Record<WmIconName, string>> = {
  current: prepareAll('current'),
  app: prepareAll('app'),
}

export type WmIconProps = {
  name: WmIconName
  /** Edge length in px. The drawing keeps its own aspect ratio inside the square. */
  size?: number
  /** The text colour (default) or the app's own colours. */
  tone?: WmIconTone
  className?: string
}

/**
 * One of the We Meditate app's icons, in the current text colour or the app's own. Decorative:
 * it is hidden from assistive technology, so the text beside it must carry the meaning.
 */
export function WmIcon({ name, size = 20, tone = 'current', className }: WmIconProps) {
  return (
    <span
      // The markup is this module's own bundled files, never data from the network.
      dangerouslySetInnerHTML={{ __html: MARKUP[tone][name] }}
      aria-hidden
      className={clsx(
        'inline-flex shrink-0 [&>svg]:block [&>svg]:h-full [&>svg]:w-full',
        className,
      )}
      style={{ width: size, height: size }}
    />
  )
}
