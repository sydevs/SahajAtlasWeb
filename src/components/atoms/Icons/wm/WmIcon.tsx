import clsx from 'clsx'

import meditate from './meditate.svg?raw'

// The We Meditate app's own line icons, so the Atlas reads as part of the same family.
//
// Origin: the `.svg` files beside this one are copied UNCHANGED from
// `wemeditate-design-system/assets/icons/` (commit b7c717b, 2026-10-29), which in turn
// copies them unchanged from the WeMeditate app (`AppTheme.icons`). Same organisation,
// same licence. To update one, copy the new file over it; never hand-edit the SVG.
//
// Only the icons the widget renders live here. Today that is one: the meditating figure
// on the "Online classes" row. Round 2 tried the app's pin, sunrise, moon and lotus too,
// and Anton found that too many icons ("we should still aim to be somewhat minimal"), so
// the rest stay in the design system until a screen genuinely needs one. Interface
// controls stay on lucide.
//
// The files carry the app's own paint (a dark stroke, a white fill), so they are recoloured
// at module load rather than edited: every literal colour becomes `currentColor`, which lets
// the call site pick the colour with a text utility (`text-ornament`, the warm coral). Their
// clip-path ids are namespaced too — each file uses `id="a"`, and two inline SVGs with the
// same id on one page would clip each other.
const SOURCES = {
  meditate,
} as const

export type WmIconName = keyof typeof SOURCES

const prepare = (name: WmIconName, svg: string) =>
  svg
    // Literal paints only — `none` and `currentColor` pass through.
    .replace(/(fill|stroke)="#[0-9a-fA-F]{3,8}"/g, '$1="currentColor"')
    .replace(/id="([^"]+)"/g, `id="sy-wm-${name}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#sy-wm-${name}-$1)`)
    // The span sizes the icon, so the root's own pixel size is dropped.
    .replace(/<svg([^>]*?)\swidth="[^"]*"/, '<svg$1')
    .replace(/<svg([^>]*?)\sheight="[^"]*"/, '<svg$1')
    .replace('<svg', '<svg aria-hidden="true" focusable="false"')

// Prepared once, at module load: the sources are static, so nothing re-parses per render.
const MARKUP = Object.fromEntries(
  Object.entries(SOURCES).map(([name, svg]) => [name, prepare(name as WmIconName, svg)]),
) as Record<WmIconName, string>

export type WmIconProps = {
  name: WmIconName
  /** Edge length in px. The drawing keeps its own aspect ratio inside the square. */
  size?: number
  className?: string
}

/**
 * One of the We Meditate app's icons, drawn in the current text colour. Decorative:
 * it is hidden from assistive technology, so the text beside it must carry the meaning.
 */
export function WmIcon({ name, size = 20, className }: WmIconProps) {
  return (
    <span
      // The markup is this module's own bundled files, never data from the network.
      dangerouslySetInnerHTML={{ __html: MARKUP[name] }}
      aria-hidden
      className={clsx(
        'inline-flex shrink-0 [&>svg]:block [&>svg]:h-full [&>svg]:w-full',
        className,
      )}
      style={{ width: size, height: size }}
    />
  )
}
