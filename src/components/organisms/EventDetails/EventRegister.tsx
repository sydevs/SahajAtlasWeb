import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/atoms/Button'
import { Link } from '@/components/atoms/Link'
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

  return (
    <Link className="text-sm font-medium text-primary-11" href={nearbyPath(event, basePath)}>
      {t('display.see_nearby')}
    </Link>
  )
}

export type EventRegisterBarProps = {
  event: Event
  basePath: string
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

  if (display.registration === 'hidden') {
    // Inactive events carry their guidance in facts + the emphasized Contact
    // action; ended/full states message here with the nearby escape hatch.
    if (display.status === 'inactive') return null

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
