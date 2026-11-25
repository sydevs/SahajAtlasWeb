import { type ReactElement, useEffect, useRef, useState } from 'react'
import * as RadixTooltip from '@radix-ui/react-tooltip'

import { tv } from '@/styles/tv'
import { frameCollision, overlayContainer } from '@/lib/overlay'

// The skin of the map's credits panel when opened, so the labels beside the map's controls read
// as the same family: the app's surface, its divider, a shadow, and a 20px corner.
const bubble = tv({
  base: 'z-50 rounded-[20px] border border-divider bg-background px-4 py-[9px] text-xs leading-5 text-gray-11 shadow-lg',
})

export type TooltipProps = {
  /** The visible label. It should be the trigger's accessible name, so the two never disagree. */
  label: string
  /** Which side of the trigger the label opens on. */
  side?: RadixTooltip.TooltipContentProps['side']
  /** One focusable element, which Radix composes its trigger props onto. */
  children: ReactElement
}

/**
 * A short label beside a control on hover and on keyboard focus, never on touch: a tap that
 * flashed the label first would read as the control not answering.
 *
 * ⚠ Radix opens on any focus that a pointer did not start, and a menu that closes hands focus
 * back to its trigger programmatically — so the settings cog lit its own label every time its
 * menu closed, even by a click elsewhere, and Chrome calls that returned focus `:focus-visible`
 * too. So a focus opens the label only when the last input was a key.
 */
let lastInputWasKey = false
let listening = false

function trackInput() {
  if (listening) return
  listening = true
  document.addEventListener('keydown', () => (lastInputWasKey = true), true)
  document.addEventListener('pointerdown', () => (lastInputWasKey = false), true)
}

export function Tooltip({ label, side = 'left', children }: TooltipProps) {
  const [open, setOpen] = useState(false)
  // Asked of the trigger itself: inside the embed's shadow root, `document` sees only the host.
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(trackInput, [])

  return (
    <RadixTooltip.Provider delayDuration={300}>
      <RadixTooltip.Root
        open={open}
        onOpenChange={(next) => {
          const el = trigger.current

          setOpen(
            next &&
              !!el &&
              (el.matches(':hover') || (lastInputWasKey && el.matches(':focus-visible'))),
          )
        }}
      >
        <RadixTooltip.Trigger ref={trigger} asChild>
          {children}
        </RadixTooltip.Trigger>
        <RadixTooltip.Portal container={overlayContainer()}>
          <RadixTooltip.Content
            className={bubble()}
            side={side}
            sideOffset={8}
            {...frameCollision()}
          >
            {label}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  )
}
