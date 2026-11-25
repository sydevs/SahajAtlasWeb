import { type ReactElement, useEffect, useState } from 'react'

import { tv } from '@/styles/tv'

// The opened shape of Mapbox's credits button beside it on the map: one pill with the control at
// its end. The button drops its own outline and shadow while the pill is out, so the two read as
// one shape.
// ⚠ The button's outline and shadow fade on the pill's own timing. The Button recipe transitions
// only background, colour and opacity, so they otherwise vanished at once while the pill was still
// fading in, and the button showed bare for the length of the fade.
const label = tv({
  slots: {
    root: 'relative inline-flex [&>button]:transition-[background,color,opacity,border-color,box-shadow] motion-reduce:[&>button]:transition-none',
    pill: 'pointer-events-none absolute inset-y-0 right-0 flex items-center rounded-full border border-divider bg-background pr-12 pl-4 text-xs whitespace-nowrap text-gray-11 opacity-0 shadow-lg transition-opacity motion-reduce:transition-none',
  },
  variants: {
    open: {
      true: { root: '[&>button]:border-transparent [&>button]:shadow-none', pill: 'opacity-100' },
    },
  },
})

export type HoverLabelProps = {
  /** The visible label. It is the control's accessible name, so the two never disagree. */
  text: string
  /** Hides the label while something else owns the control, such as its open menu. */
  suppressed?: boolean
  /** The control: one element whose root is a `<button>`, drawn on top of the pill. */
  children: ReactElement
}

let lastInputWasKey = false
let listening = false

function trackInput() {
  if (listening) return
  listening = true
  document.addEventListener('keydown', () => (lastInputWasKey = true), true)
  document.addEventListener('pointerdown', () => (lastInputWasKey = false), true)
}

/**
 * A control's name, drawn out of its right-hand end on hover and on keyboard focus — never on
 * touch, where a tap that showed the label first would read as the control not answering. It
 * opens leftward, for the map's right-hand column.
 *
 * ⚠ A focus opens it only when the last input was a key. A menu that closes hands focus back to
 * its trigger, and Chrome calls that returned focus `:focus-visible` even after a mouse click, so
 * the settings cog otherwise lit its own label every time its menu closed.
 */
export function HoverLabel({ text, suppressed = false, children }: HoverLabelProps) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const open = (hovered || focused) && !suppressed
  const { root, pill } = label({ open })

  useEffect(trackInput, [])

  return (
    <span
      className={root()}
      onBlur={() => setFocused(false)}
      onFocus={(event) => setFocused(lastInputWasKey && event.target.matches(':focus-visible'))}
      // Per event, not `useHasRealPointer`: a touchscreen laptop or an iPad with a mouse has both.
      onPointerEnter={(event) => event.pointerType === 'mouse' && setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <span aria-hidden className={pill()}>
        {text}
      </span>
      {children}
    </span>
  )
}
