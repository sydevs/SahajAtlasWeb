import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/atoms/Button'
import { Link } from '@/components/atoms/Link'
import { AnchorIcon } from '@/components/atoms/Icons'
import { useEventDisplay } from '@/hooks/use-event-display'
import { parentOf } from '@/lib/shape'
import { Event } from '@/types'

/**
 * Where "See nearby events" leads: back up the drawer stack to the event's
 * parent region when the URL carries the ancestry, else a distance-ranked
 * search centred on the event (flat direct links have no region ancestry).
 */
export const nearbyPath = (event: Event, basePath: string): string => {
  const parent = parentOf(basePath)

  if (parent) return parent

  const { longitude, latitude } = event.address ?? {}

  return longitude != null && latitude != null
    ? `/search?center=${longitude},${latitude}`
    : '/search'
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
  className?: string
}

/**
 * The Register slot — the ONLY filled/emphasized control on the surface (issue
 * #52). Open native events route to the registration drawer; open external
 * events link out (the sole external-mode difference — all copy/state is
 * identical). Closed courses show a disabled button + the contact helper;
 * terminal states replace the button with their message + escape hatch.
 */
export function EventRegisterBar({ event, basePath, className }: EventRegisterBarProps) {
  const { t } = useTranslation('events')
  const navigate = useNavigate()
  const { display, registerLabel, microcopy, contactHelper } = useEventDisplay(event)

  if (display.registration === 'hidden') {
    // Inactive events carry their guidance in facts + the emphasized Contact
    // action; ended/full states message here with the nearby escape hatch.
    if (display.status === 'inactive') return null

    // The ended message lives in the facts block; the register slot only adds
    // the escape hatch (and, for full events — whose facts stay normal — the
    // full message + contact helper).
    return (
      <div className={`flex flex-col items-center gap-1 text-center ${className ?? ''}`}>
        {display.full && <p className="text-sm text-gray-11">{t('display.event_full')}</p>}
        <SeeNearbyLink basePath={basePath} event={event} />
        {contactHelper && <p className="text-xs text-gray-11">{contactHelper}</p>}
      </div>
    )
  }

  const closed = display.registration === 'closed'
  const external = event.registrationMode === 'external' && event.externalRegistrationUrl

  return (
    <div className={`flex flex-col items-center gap-1.5 ${className ?? ''}`}>
      {!closed && external ? (
        <Button
          className="w-full"
          color="primary"
          href={event.externalRegistrationUrl ?? undefined}
          rel="noopener noreferrer"
          target="_blank"
          variant="solid"
        >
          <span className="font-semibold tracking-wider">{registerLabel}</span>
          <AnchorIcon className="text-primary-foreground" />
        </Button>
      ) : (
        <Button
          className="w-full"
          color="primary"
          disabled={closed}
          variant="solid"
          onClick={() => navigate(`${basePath}/register`)}
        >
          <span className="font-semibold tracking-wider">{registerLabel}</span>
        </Button>
      )}
      {microcopy.map((line) => (
        <p key={line} className="text-center text-xs text-gray-11">
          {line}
        </p>
      ))}
      {contactHelper && <p className="text-center text-xs text-gray-11">{contactHelper}</p>}
    </div>
  )
}
