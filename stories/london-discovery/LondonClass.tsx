import type { Event } from '@/types'

import { DateTime } from 'luxon'

import { ClassPageLayout } from '../class-page/ClassPage'

import { days, sessionTitle, type Session } from './fixtures'

import { mockEvent } from '@/mocks/events'

const weekdayCodes = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const
const languageCodes: Record<string, string> = { English: 'en', French: 'fr', Spanish: 'es' }

function eventFor(session: Session): Event {
  const { id, venue, day, start, languages } = session
  const now = DateTime.now().setZone('Europe/London')
  const weekdayIndex = days.indexOf(day)
  const [hour, minute] = start.split(':').map(Number)
  const thisWeek = now.startOf('week').plus({ days: weekdayIndex }).set({ hour, minute })
  const next = thisWeek > now ? thisWeek : thisWeek.plus({ weeks: 1 })
  const path = '/united-kingdom/london/' + id

  return {
    ...mockEvent,
    id: Number(id),
    title: sessionTitle(session),
    address: {
      street: venue.street,
      city: 'London',
      country: 'GB',
      latitude: venue.latitude,
      longitude: venue.longitude,
    },
    schedule: {
      ...mockEvent.schedule!,
      firstDate: next.minus({ weeks: 13 }).toJSDate(),
      endTime: next.plus({ hours: 1 }).toFormat('HH:mm'),
      weekdays: [weekdayCodes[weekdayIndex]],
      upcomingDates: [next.toJSDate(), next.plus({ weeks: 1 }).toJSDate()],
    },
    languages: languages.map((name) => languageCodes[name]),
    images: [],
    contactPhone: null,
    contactName: null,
    website: null,
    region: null,
    path,
    webPath: path,
    webUrl: null,
  }
}

export function LondonClass({
  session,
  place,
  showBanner,
  onBack,
}: {
  session: Session
  place: string
  showBanner: boolean
  onBack: () => void
}) {
  const { venue, day, languages, published } = session

  return (
    <ClassPageLayout
      backPlace={place}
      banner={showBanner ? 'short' : undefined}
      description={
        published?.paragraphs ?? [
          `Join us in ${venue.area} on ${day}s for a guided meditation in ${languages.join(' and ')}. Beginners are welcome and every session is free.`,
        ]
      }
      event={published?.event ?? eventFor(session)}
      onBack={onBack}
    />
  )
}
