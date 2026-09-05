import type { EventDisplay } from '@/lib/shape'
import type { EventSurfaceProps } from './EventDetails'

import { useTranslation } from 'react-i18next'
import { ArrowUpRight } from 'lucide-react'

import { useAtlasNavigate } from '@/hooks/use-atlas-navigate'
import { Button } from '@/components/atoms/Button'
import { useEventDisplay } from '@/hooks/use-event-display'
import { parentOf, searchPath } from '@/lib/shape'
import { Event } from '@/types'

/**
 * This decides where "See nearby events" leads. When the URL carries the
 * event's region ancestry, it goes back up the drawer stack to the parent
 * region. Otherwise, it runs a distance-ranked search centered on the event.
 * A flat direct link has no region ancestry.
 */
const nearbyPath = (event: Event, basePath: string): string => {
  const parent = parentOf(basePath)

  if (parent) return parent

  const { longitude, latitude } = event.address ?? {}

  return searchPath(longitude != null && latitude != null ? [longitude, latitude] : undefined)
}

/** This is the escape hatch out of terminal states, back into live inventory. */
function SeeNearbyLink({ event, basePath }: { event: Event; basePath: string }) {
  const { t } = useTranslation('events')
  const navigate = useAtlasNavigate()

  return (
    <Button
      className="w-full"
      color="primary"
      variant="flat"
      onClick={() => navigate(nearbyPath(event, basePath))}
    >
      {t('display.see_nearby')}
    </Button>
  )
}

export type EventRegisterBarProps = EventSurfaceProps

/** This returns whether the register slot renders anything for this event.
 *  The sticky mobile footer uses this, so it never pins an empty bar.
 *  Inactive events have no slot. Contact is the emphasized action instead.
 *  An external-mode event with no URL has no CTA at all. This matches the
 *  pre-redesign behavior. */
export const hasRegisterSlot = (event: Event, display: EventDisplay): boolean => {
  if (display.status === 'inactive') return false
  if (
    display.registration === 'open' &&
    event.registrationMode === 'external' &&
    !event.externalRegistrationUrl
  )
    return false

  return true
}

/**
 * The Register slot is the only filled, emphasized control on the surface
 * (issue #52). An open native event routes to the registration drawer. An
 * open external event links out instead. That is the only difference between
 * the two modes. All other copy and state stay identical. A closed course
 * shows a disabled button and the contact helper. A terminal state replaces
 * the button with its message and an escape hatch.
 */
export function EventRegisterBar({ event, basePath }: EventRegisterBarProps) {
  const navigate = useAtlasNavigate()
  const { display, registerLabel, microcopy, contactHelper, blockedMessage } =
    useEventDisplay(event)

  // Inactive events carry their guidance in the facts and the emphasized
  // Contact action. An external-mode event with no URL has no CTA at all.
  if (!hasRegisterSlot(event, display)) return null

  if (display.registration === 'hidden') {
    return (
      <div className="flex flex-col items-center gap-1 text-center">
        {/* The ended message lives in the facts block. A full event's facts stay
            normal, so its message renders here instead. */}
        {display.full && blockedMessage && <p className="text-sm text-gray-11">{blockedMessage}</p>}
        <SeeNearbyLink basePath={basePath} event={event} />
        {contactHelper && <p className="text-xs text-gray-11">{contactHelper}</p>}
      </div>
    )
  }

  const closed = display.registration === 'closed'
  const external = !closed && event.registrationMode === 'external' && event.externalRegistrationUrl

  return (
    <div className="flex flex-col items-center gap-1.5">
      <Button
        className="w-full"
        color="primary"
        variant="solid"
        {...(external
          ? { href: external, rel: 'noopener noreferrer', target: '_blank' }
          : { disabled: closed, onClick: () => navigate(`${basePath}/register`) })}
      >
        <span className="font-semibold tracking-wider">{registerLabel}</span>
        {external && <ArrowUpRight className="text-primary-foreground" size={16} />}
      </Button>
      {microcopy.map((line) => (
        <p key={line} className="text-center text-xs text-gray-11">
          {line}
        </p>
      ))}
      {contactHelper && <p className="text-center text-xs text-gray-11">{contactHelper}</p>}
    </div>
  )
}
