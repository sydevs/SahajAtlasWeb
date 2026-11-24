import { ChevronRight, MapPin } from 'lucide-react'
import clsx from 'clsx'

import { days, type Day, type Session, timeOf, sessionTitle } from './fixtures'

interface ResultsProps {
  classes: Session[]
  distances: Map<string, number>
  singleVenue: boolean
  selectedId: string | null
  onLocate: (id: string, trigger: HTMLElement) => void
  onOpen: (session: Session) => void
  onHighlight: (id: string | null) => void
}

// This summary is also the class link behind a map pin. Only the grouping changes in Week.
export function SessionSummary({
  session,
  week = false,
  distance,
}: {
  session: Session
  week?: boolean
  distance?: number
}) {
  const { venue, day, start, languages } = session

  return (
    <>
      {week && (
        <span className="w-[62px] shrink-0 self-start pt-0.5 text-sm font-semibold whitespace-nowrap text-primary-11 tabular-nums">
          {timeOf(start)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-base leading-snug font-semibold">{sessionTitle(session)}</span>
        {!week && (
          <span className="mt-1 block text-sm">
            {day}s at {timeOf(start)}
          </span>
        )}
        <span className="mt-1 block text-sm leading-snug text-gray-11">
          {venue.street}, {venue.area}
          {distance !== undefined && ' · ' + distance.toFixed(1) + ' mi'}
        </span>
        <span className="block text-sm text-gray-11">{languages.join(' · ')}</span>
      </span>
    </>
  )
}

function Row({
  session,
  distances,
  week,
  singleVenue,
  selectedId,
  onLocate,
  onOpen,
  onHighlight,
}: Omit<ResultsProps, 'classes'> & { session: Session; week: boolean }) {
  const { venue } = session
  const distance = distances.get(venue.id)

  return (
    <li
      className={clsx(
        'group flex scroll-mt-[calc(var(--class-host-header-height)+60px)] items-center gap-1 border-b border-divider px-2 transition-colors focus-within:bg-primary-2 hover:bg-primary-2',
        selectedId === venue.id && 'bg-primary-3',
      )}
      data-venue={venue.id}
    >
      <button
        className="flex min-w-0 flex-1 scroll-mt-[calc(var(--class-host-header-height)+60px)] items-center gap-3 py-3.5 text-start"
        type="button"
        onBlur={() => onHighlight(null)}
        onClick={() => onOpen(session)}
        onFocus={() => onHighlight(venue.id)}
        onMouseEnter={() => onHighlight(venue.id)}
        onMouseLeave={() => onHighlight(null)}
      >
        <SessionSummary distance={distance} session={session} week={week} />
        {singleVenue && <ChevronRight aria-hidden className="shrink-0 text-gray-9" size={15} />}
      </button>
      {!singleVenue && (
        <button
          aria-label={'Show ' + venue.name + ' on map'}
          className="grid size-11 shrink-0 scroll-mt-[calc(var(--class-host-header-height)+60px)] place-items-center rounded-full text-primary-11 hover:bg-primary-4"
          title="Show on map"
          type="button"
          onClick={(e) => onLocate(venue.id, e.currentTarget)}
        >
          <MapPin aria-hidden size={17} />
        </button>
      )}
    </li>
  )
}

export function CityDirectory({
  classes,
  onCity,
}: {
  classes: Session[]
  onCity: (province: string, city: string) => void
}) {
  const provinces = new Map<string, Map<string, number>>()

  for (const { venue } of classes) {
    const province = venue.province ?? ''
    const cities = provinces.get(province) ?? new Map<string, number>()

    cities.set(venue.area, (cities.get(venue.area) ?? 0) + 1)
    provinces.set(province, cities)
  }

  return (
    <div aria-label="Choose a city">
      {Array.from(provinces, ([province, cities]) => (
        <section key={province} className="mb-5">
          <h2 className="border-b border-divider py-3 font-semibold">{province}</h2>
          <ul>
            {Array.from(cities, ([city, count]) => (
              <li key={city}>
                <button
                  className="flex min-h-11 w-full items-center gap-2 border-b border-divider px-2 text-start hover:bg-primary-2"
                  type="button"
                  onClick={() => onCity(province, city)}
                >
                  <span className="flex-1 font-medium">{city}</span>
                  <span className="text-sm text-gray-11">
                    {count} {count === 1 ? 'class' : 'classes'}
                  </span>
                  <ChevronRight aria-hidden size={15} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export function Results({ week, ...props }: ResultsProps & { week: boolean }) {
  if (!week)
    return (
      <ul aria-label="Class list">
        {props.classes.map((session) => (
          <Row key={session.id} {...props} session={session} week={false} />
        ))}
      </ul>
    )

  return (
    <div aria-label="Weekly timetable">
      {days.map((day) => {
        const onDay = props.classes
          .filter((session) => session.day === day)
          .sort((a, b) => a.start.localeCompare(b.start))

        if (!onDay.length) return null

        return (
          <section key={day} className="mb-5">
            <h2 className="border-b border-divider px-2 pb-2 text-sm font-semibold text-gray-11">
              {day}
            </h2>
            <ul>
              {onDay.map((session) => (
                <Row key={session.id} {...props} week session={session} />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

export function WeekDays({
  classes,
  day,
  setDay,
}: {
  classes: Session[]
  day: string
  setDay: (value: Day | '') => void
}) {
  return (
    <div aria-label="Choose a weekday" className="mb-3 grid grid-cols-7 gap-1" role="group">
      {days.map((d) => {
        const count = classes.filter((s) => s.day === d).length
        const active = day === d

        return (
          <button
            key={d}
            aria-label={d + ', ' + count + (count === 1 ? ' class' : ' classes')}
            aria-pressed={active}
            className={clsx(
              'flex min-h-12 flex-col items-center justify-center rounded-md text-sm leading-tight',
              active
                ? 'bg-primary-12 text-white'
                : 'bg-gray-2 text-foreground enabled:hover:bg-primary-3 disabled:text-gray-10',
            )}
            disabled={!count && !active}
            type="button"
            onClick={() => setDay(active ? '' : d)}
          >
            <span className="font-semibold">{d.slice(0, 3)}</span>
            <span className="text-xs">{count}</span>
          </button>
        )
      })}
    </div>
  )
}
