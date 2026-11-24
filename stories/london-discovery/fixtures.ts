import type { Event } from '@/types'

import { distanceKm } from '@/lib/geo'

export const days = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const
export type Day = (typeof days)[number]
export type Sample = 'city' | 'two' | 'one'

export interface Venue {
  id: string
  area: string
  province?: string
  name: string
  street: string
  latitude: number
  longitude: number
}

export interface Session {
  id: string
  venue: Venue
  day: Day
  start: string
  languages: string[]
  published?: { event: Event; paragraphs: string[] }
}

// Venue names and the six English classes come from the London example.
// Coordinates are approximate. Extra sessions exercise time and language choices.
const chelsea = {
  id: 'chelsea',
  area: 'Chelsea',
  name: 'The Hut',
  street: '12 Alpha Place',
  latitude: 51.4843,
  longitude: -0.1734,
}
const enfield = {
  id: 'enfield',
  area: 'Enfield',
  name: 'Enfield Town Library',
  street: '66 Church Street',
  latitude: 51.6515,
  longitude: -0.0855,
}
const covent = {
  id: 'covent',
  area: 'Covent Garden',
  name: '8 Hop Gardens',
  street: '8 Hop Gardens',
  latitude: 51.5109,
  longitude: -0.1266,
}
const croydon = {
  id: 'croydon',
  area: 'Croydon',
  name: 'Croydon Town Hall',
  street: 'Katharine Street',
  latitude: 51.3714,
  longitude: -0.0994,
}
const hampstead = {
  id: 'hampstead',
  area: 'Hampstead',
  name: 'Friends Meeting House',
  street: '120 Heath Street',
  latitude: 51.5605,
  longitude: -0.1779,
}
const swiss = {
  id: 'swiss',
  area: 'Swiss Cottage',
  name: 'Swiss Cottage Centre',
  street: '19 Winchester Road',
  latitude: 51.5434,
  longitude: -0.1701,
}

export const sessions: Session[] = [
  { id: '401', venue: chelsea, day: 'Tuesday', start: '19:30', languages: ['English'] },
  { id: '402', venue: enfield, day: 'Saturday', start: '11:00', languages: ['English'] },
  { id: '403', venue: covent, day: 'Tuesday', start: '19:30', languages: ['English'] },
  { id: '404', venue: croydon, day: 'Tuesday', start: '19:00', languages: ['English'] },
  { id: '405', venue: hampstead, day: 'Thursday', start: '19:30', languages: ['English'] },
  { id: '406', venue: swiss, day: 'Tuesday', start: '19:30', languages: ['English'] },
  { id: '407', venue: chelsea, day: 'Thursday', start: '18:00', languages: ['Spanish'] },
  { id: '408', venue: chelsea, day: 'Saturday', start: '10:30', languages: ['English'] },
  { id: '409', venue: enfield, day: 'Wednesday', start: '18:30', languages: ['French'] },
]

export const samples = {
  city: sessions,
  two: sessions.filter(({ venue }) => venue === chelsea || venue === enfield),
  one: sessions.filter(({ venue }) => venue === chelsea),
}

export function venuesOf(classes: Session[]) {
  return Array.from(new Map(classes.map(({ venue }) => [venue.id, venue])).values())
}

export function sessionTitle({ published, venue, start }: Session) {
  return published?.event.title.trim() || `${periodOf(start)} Meditation at ${venue.name}`
}

export function timeOf(start: string) {
  const [hour, minute] = start.split(':').map(Number)

  return (
    (hour % 12 || 12) +
    (minute ? ':' + String(minute).padStart(2, '0') : '') +
    (hour < 12 ? ' am' : ' pm')
  )
}

export function periodOf(start: string) {
  if (start < '12:00') return 'Morning'

  return start < '17:00' ? 'Afternoon' : 'Evening'
}

export function venueAddress(venue: Venue) {
  return venue.name === venue.street || venue.name.startsWith(venue.street + ' ')
    ? venue.name
    : venue.name + ', ' + venue.street
}

// Starting points, independently of whether an area hosts a class.
export const startingPoints: Record<string, [number, number]> = {
  Brixton: [-0.1142, 51.4627],
  Chelsea: [-0.1684, 51.4875],
  'Covent Garden': [-0.124, 51.512],
  Croydon: [-0.1, 51.373],
  Enfield: [-0.081, 51.652],
  Hampstead: [-0.178, 51.556],
  'Swiss Cottage': [-0.175, 51.543],
  Waterloo: [-0.113, 51.503],
}

export function distancesFrom(area: string, venues: Venue[]) {
  const point = startingPoints[area]

  if (!point) return new Map<string, number>()

  return new Map(
    venues.map((venue) => [
      venue.id,
      distanceKm(point, [venue.longitude, venue.latitude]) / 1.609344,
    ]),
  )
}
