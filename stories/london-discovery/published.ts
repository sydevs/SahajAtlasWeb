import { DateTime } from 'luxon'

import { days, type Session, type Venue } from './fixtures'
import listings from './published-listings.json'

import { EventSchema } from '@/types'

// Published SahajCloud /api/events snapshot, 23 Nov 2026. Active in-person weekly
// classes with upcoming dates in Canada and the /cz/praha/ region. Maps and class
// details use the same listing as the timetable, without a runtime CMS request.
const provinces: Record<string, string> = {
  AB: 'Alberta',
  BC: 'British Columbia',
  NS: 'Nova Scotia',
  ON: 'Ontario',
  SK: 'Saskatchewan',
}
const languageNames = new Intl.DisplayNames('en', { type: 'language' })

export type Place = 'London' | 'Canada' | 'Prague'

function publishedSessions(country: string): Session[] {
  const venues = new Map<string, Venue>()
  const sessions = listings
    .filter((listing) => listing.address.country === country)
    .map((listing) => {
      const { address, schedule } = listing
      // The CMS occurrence instants and the browser can use different timezone rules.
      // For a weekly timetable, anchor the published dates to the organiser's local start.
      const upcoming = schedule.upcomingDates.map((instant) => {
        const zone = schedule.firstDate_tz
        const date = DateTime.fromISO(instant, { zone }).toISODate()

        return DateTime.fromISO(date + 'T' + listing.startTime, { zone })
      })
      const event = EventSchema.parse({
        ...listing,
        eventType: 'offline',
        path: listing.webPath,
        schedule: {
          ...schedule,
          upcomingDates: upcoming.map((d) => d.toJSDate()),
          recurrenceType: 'WEEKLY',
          interval: 1,
        },
      })
      const venueId = [address.country, address.city, address.street].join('/')
      let venue = venues.get(venueId)

      if (!venue) {
        venue = {
          id: venueId,
          area: address.city,
          province: provinces[address.region],
          name: address.venueName || address.street,
          street: address.street,
          latitude: address.latitude,
          longitude: address.longitude,
        }
        venues.set(venueId, venue)
      }

      return {
        id: String(listing.id),
        venue,
        day: days[upcoming[0].weekday - 1],
        start: listing.startTime,
        languages: listing.languages.map((code) => languageNames.of(code) ?? code),
        published: { event, paragraphs: listing.paragraphs },
      }
    })

  return sessions.sort(
    (a, b) =>
      (a.venue.province ?? '').localeCompare(b.venue.province ?? '') ||
      a.venue.area.localeCompare(b.venue.area) ||
      days.indexOf(a.day) - days.indexOf(b.day) ||
      a.start.localeCompare(b.start),
  )
}

export const published = { Canada: publishedSessions('CA'), Prague: publishedSessions('CZ') }
