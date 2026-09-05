import * as React from 'react'
import clsx from 'clsx'

import { IconSvgProps } from '@/types'

type BaseIconProps = {
  view?: string
  size?: number
  paths?: string[] | undefined
  pathProps?: React.SVGProps<SVGPathElement>
  /**
   * Mirror the glyph under RTL. Set this on directional icons, such as a
   * drill-in chevron or a route arrow, whose meaning ties to reading order.
   * Declaring it on the icon means every call site inherits the behaviour,
   * instead of each one remembering `rtl:-scale-x-100`. Symmetric glyphs,
   * such as globe and calendar, leave it off. So do glyphs that read the
   * same both ways.
   */
  flipRtl?: boolean
}

export const BaseIcon: React.FC<BaseIconProps & IconSvgProps> = ({
  size = 24,
  view = '0 0 24 24',
  paths = [],
  pathProps = {
    fill: 'currentColor',
    fillRule: 'evenodd',
    clipRule: 'evenodd',
  },
  children,
  height,
  flipRtl = false,
  className,
  ...props
}) => (
  <svg
    aria-hidden="true"
    // This merges the classes instead of assigning them before the spread.
    // `{...props}` used to come after a computed className. So any caller
    // passing both `onClick` and `className` silently lost the pointer
    // affordance.
    className={clsx(
      props.onClick && 'cursor-pointer hover:opacity-80',
      flipRtl && 'rtl:-scale-x-100',
      className,
    )}
    fill="none"
    focusable="false"
    height={size || height}
    role="presentation"
    viewBox={view}
    width={size || height}
    {...props}
  >
    {children ? children : paths.map((path, index) => <path key={index} d={path} {...pathProps} />)}
  </svg>
)
