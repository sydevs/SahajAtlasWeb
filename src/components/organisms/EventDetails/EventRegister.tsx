import type { EventDisplay } from '@/lib/shape'
import type { EventSurfaceProps } from './EventDetails'

import { useTranslation } from 'react-i18next'
import { ArrowUpRight } from 'lucide-react'

import { useAtlasNavigate } from '@/hooks/use-atlas-navigate'
import { Button } from '@/components/atoms/Button'
import { useEventDisplay } from '@/hooks/use-event-display'
import {
  DEFAULT_FILTERS,
  EXCLUDE_EVENT_PARAM,
  SEARCH_COUNTRY_PARAM,
  SORT_PARAM,
  filtersToParams,
  parentOf,
  searchPath,
} from '@/lib/shape'
import { Event } from '@/types'

/**
 * This decides where "See classes nearby" leads: a search around the class, closest first, that
 * names the place, so each card reads "12 km from Stirling". It leaves out the class the visitor
 * just left. A class with no coordinates goes up to its parent region instead.
 */
const nearbyPath = (event: Event, basePath: string): string => {
  const { longitude, latitude, city, country } = event.address ?? {}

  if (longitude == null || latitude == null) return parentOf(basePath) ?? searchPath()

  const params = new URLSearchParams(searchPath([longitude, latitude]).split('?')[1])

  params.set(SORT_PARAM, 'closest')
  params.set(EXCLUDE_EVENT_PARAM, String(event.id))
  if (city) params.set('q', city)
  if (country) params.set(SEARCH_COUNTRY_PARAM, country)

  return `/search?${params.toString()}`
}

const onlinePath = `/search?${filtersToParams({ ...DEFAULT_FILTERS, format: 'online' }).toString()}`

/** This is the escape hatch out of terminal states, back into live inventory. */
function SeeNearbyLink({
  event,
  basePath,
  secondary = false,
}: {
  event: Event
  basePath: string
  /** Soft grey, for when something else on the page is the one main action. */
  secondary?: boolean
}) {
  const { t } = useTranslation()
  const navigate = useAtlasNavigate()

  return (
    <Button
      className="w-full"
      color={secondary ? 'neutral' : 'primary'}
      variant={secondary ? 'flat' : 'solid'}
      onClick={() => navigate(nearbyPath(event, basePath))}
    >
      {t('event.display.see_classes_nearby')}
    </Button>
  )
}

/**
 * The way forward from a class that can't be booked: by request, or finished. Nearby comes
 * first, since an in-person class is what brought the visitor here. Online is the fallback for
 * anyone with no class within reach.
 */
export function EventOnward({ event, basePath }: EventSurfaceProps) {
  const { t } = useTranslation()
  const navigate = useAtlasNavigate()
  const { display } = useEventDisplay(event)
  // A by-request class says "Contact host for timings", so Contact is its one solid button.
  const contactLeads =
    display.status === 'inactive' && Boolean(event.contactPhone || event.contactEmail)

  return (
    <div className="flex flex-col gap-2">
      <SeeNearbyLink basePath={basePath} event={event} secondary={contactLeads} />
      <Button
        className="w-full"
        color="neutral"
        variant="flat"
        onClick={() => navigate(onlinePath)}
      >
        {t('event.display.see_online_classes')}
      </Button>
    </div>
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
        size="lg"
        variant="solid"
        {...(external
          ? { href: external, rel: 'noopener noreferrer', target: '_blank' }
          : { disabled: closed, onClick: () => navigate(`${basePath}/register`) })}
      >
        <span className="font-semibold">{registerLabel}</span>
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
