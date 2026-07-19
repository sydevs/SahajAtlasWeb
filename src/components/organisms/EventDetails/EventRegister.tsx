import type { EventDisplay } from '@/lib/shape'
import type { EventSurfaceProps } from './EventDetails'

import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/atoms/Button'
import { AnchorIcon } from '@/components/atoms/Icons'
import { useEventDisplay } from '@/hooks/use-event-display'
import { parentOf, searchPath } from '@/lib/shape'
import { Event } from '@/types'

/**
 * Where "See nearby events" leads: back up the drawer stack to the event's
 * parent region when the URL carries the ancestry, else a distance-ranked
 * search centred on the event (flat direct links have no region ancestry).
 */
const nearbyPath = (event: Event, basePath: string): string => {
  const parent = parentOf(basePath)

  if (parent) return parent

  const { longitude, latitude } = event.address ?? {}

  return searchPath(longitude != null && latitude != null ? [longitude, latitude] : undefined)
}

/** The escape hatch out of terminal states, back into live inventory. */
function SeeNearbyLink({ event, basePath }: { event: Event; basePath: string }) {
  const { t } = useTranslation('events')
  const navigate = useNavigate()

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

/** Whether the register slot renders anything for this event — the sticky
 *  mobile footer uses this so it never pins an empty bar. Inactive events have
 *  no slot (contact is the emphasized action), and an external-mode event
 *  without its URL has no CTA at all (matching the pre-redesign behavior). */
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
 * The Register slot — the ONLY filled/emphasized control on the surface (issue
 * #52). Open native events route to the registration drawer; open external
 * events link out (the sole external-mode difference — all copy/state is
 * identical). Closed courses show a disabled button + the contact helper;
 * terminal states replace the button with their message + escape hatch.
 */
export function EventRegisterBar({ event, basePath }: EventRegisterBarProps) {
  const navigate = useNavigate()
  const { display, registerLabel, microcopy, contactHelper, blockedMessage } =
    useEventDisplay(event)

  // Inactive events carry their guidance in facts + the emphasized Contact
  // action; an external-mode event without its URL has no CTA at all.
  if (!hasRegisterSlot(event, display)) return null

  if (display.registration === 'hidden') {
    return (
      <div className="flex flex-col items-center gap-1 text-center">
        {/* The ended message lives in the facts block; full events (whose facts
            stay normal) carry theirs here. */}
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
        {external && <AnchorIcon className="text-primary-foreground" />}
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
