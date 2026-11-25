import { type ReactElement, useEffect, useRef, useState } from 'react'

import { tv } from '@/styles/tv'
import { frameElement } from '@/lib/overlay'

// The opened shape of Mapbox's credits button beside it on the map: one pill with the control at
// its end. The button drops its own outline and shadow while the pill is out, so the two read as
// one shape.
// ⚠ The button's outline and shadow fade on the pill's own timing. The Button recipe transitions
// only background, colour and opacity, so they otherwise vanished at once while the pill was still
// fading in, and the button showed bare for the length of the fade.
const label = tv({
  slots: {
    root: 'relative inline-flex [&>button]:transition-[background,color,opacity,border-color,box-shadow] motion-reduce:[&>button]:transition-none',
    pill: 'pointer-events-none absolute inset-y-0 flex items-center rounded-full border border-divider bg-background text-xs whitespace-nowrap text-gray-11 opacity-0 shadow-lg transition-opacity motion-reduce:transition-none',
  },
  variants: {
    // The side the pill grows toward; the button sits at the other end.
    side: {
      left: { pill: 'right-0 pr-12 pl-4' },
      right: { pill: 'left-0 pr-4 pl-12' },
    },
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
let mounted = 0

const keyDown = () => (lastInputWasKey = true)
const pointerDown = () => (lastInputWasKey = false)

// Page-wide listeners on a host's document, so they leave with the last label that needs them.
function trackInput() {
  if (mounted++ === 0) {
    document.addEventListener('keydown', keyDown, true)
    document.addEventListener('pointerdown', pointerDown, true)
  }

  return () => {
    if (--mounted === 0) {
      document.removeEventListener('keydown', keyDown, true)
      document.removeEventListener('pointerdown', pointerDown, true)
    }
  }
}

/**
 * A control's name, drawn out of its right-hand end on hover and on keyboard focus — never on
 * touch, where a tap that showed the label first would read as the control not answering. It
 * grows leftward, for the map's right-hand column, and rightward where the frame (or the window)
 * leaves it no room on the left.
 *
 * ⚠ A focus opens it only when the last input was a key. A menu that closes hands focus back to
 * its trigger, and Chrome calls that returned focus `:focus-visible` even after a mouse click, so
 * the settings cog otherwise lit its own label every time its menu closed.
 */
export function HoverLabel({ text, suppressed = false, children }: HoverLabelProps) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [side, setSide] = useState<'left' | 'right'>('left')
  const pillRef = useRef<HTMLSpanElement>(null)
  const open = (hovered || focused) && !suppressed
  const { root, pill } = label({ open, side })

  // Measured as it opens, never on render: the pill is in the DOM at zero opacity, so its width is
  // already known, and the button can move (a sheet drag, a resize) between one hover and the next.
  const placeBeside = (button: Element) => {
    const width = pillRef.current?.offsetWidth ?? 0
    const at = button.getBoundingClientRect()
    const bounds = frameElement()?.getBoundingClientRect() ?? { left: 0, right: window.innerWidth }
    const roomLeft = at.right - bounds.left
    const roomRight = bounds.right - at.left

    setSide(roomLeft >= width || roomLeft >= roomRight ? 'left' : 'right')
  }

  useEffect(trackInput, [])

  return (
    <span
      className={root()}
      onBlur={() => setFocused(false)}
      onFocus={(event) => {
        const show = lastInputWasKey && event.target.matches(':focus-visible')

        if (show) placeBeside(event.target)
        setFocused(show)
      }}
      // Per event, not `useHasRealPointer`: a touchscreen laptop or an iPad with a mouse has both.
      onPointerEnter={(event) => {
        if (event.pointerType !== 'mouse') return
        placeBeside(event.currentTarget)
        setHovered(true)
      }}
      onPointerLeave={() => setHovered(false)}
    >
      <span ref={pillRef} aria-hidden className={pill()}>
        {text}
      </span>
      {children}
    </span>
  )
}
