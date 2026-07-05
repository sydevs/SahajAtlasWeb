// Static fixtures for Ladle stories (and any future node tests). Typed against
// the zod-inferred entity types in src/types so a schema change surfaces here as
// a type error. Dates are fixed (never `new Date()`) so previews are stable.
import type { Event, EventImage, EventSlim, RegionRef } from '@/types'

export const mockEventImages: EventImage[] = [
  {
    url: 'https://picsum.photos/seed/atlas-hall/1200/800',
    thumbnailURL: 'https://picsum.photos/seed/atlas-hall/400/300',
    alt: 'Meditation hall',
  },
  {
    url: 'https://picsum.photos/seed/atlas-group/1200/800',
    thumbnailURL: 'https://picsum.photos/seed/atlas-group/400/300',
    alt: 'Group session',
  },
]

// A city (Cambridge) under the UK — the region-optional shape. Breadcrumbs carry
// the ancestor ids (for count aggregation); the canonical route is the server
// `webPath`.
const mockRegion: RegionRef = {
  id: 8001,
  slug: 'cambridge',
  level: 'city',
  name: 'Cambridge',
  subtitle: null,
  breadcrumbs: [{ doc: 44 }, { doc: 8001 }],
  webPath: '/united-kingdom/cambridge',
  webUrl: 'https://atlas.example/united-kingdom/cambridge',
}

export const mockEventSlim: EventSlim = {
  id: 101,
  title: 'Saturday Morning Meditation',
  eventType: 'offline',
  languages: ['en'],
  address: {
    street: '5 Market St',
    city: 'Cambridge',
    country: 'GB',
    region: 'CAM',
    postCode: 'CB2 3QJ',
    latitude: 52.2053,
    longitude: 0.1218,
  },
  schedule: {
    firstDate: new Date('2026-01-10T09:30:00Z'),
    firstDate_tz: 'Europe/London',
    endTime: '11:00',
    recurrenceType: 'WEEKLY',
    upcomingDates: [new Date('2026-07-04T09:30:00Z'), new Date('2026-07-11T09:30:00Z')],
  },
  region: mockRegion,
  path: '/united-kingdom/cambridge/101',
  distance: 3,
}

export const mockEventSlimOnline: EventSlim = {
  ...mockEventSlim,
  id: 102,
  title: 'Online Evening Meditation',
  eventType: 'online',
  languages: ['fr'],
  schedule: { ...mockEventSlim.schedule!, recurrenceType: 'DAILY' },
  path: '/united-kingdom/cambridge/102',
  distance: 42,
}

export const mockEventSlimList: EventSlim[] = [
  mockEventSlim,
  mockEventSlimOnline,
  {
    ...mockEventSlim,
    id: 103,
    title: 'Beginners Course',
    address: { city: 'Oxford', country: 'GB' },
    schedule: null,
    path: '/united-kingdom/cambridge/103',
    distance: 18,
  },
]

export const mockEvent: Event = {
  id: 101,
  title: 'Saturday Morning Meditation',
  eventType: 'offline',
  languages: ['en'],
  onlineUrl: null,
  address: mockEventSlim.address,
  schedule: mockEventSlim.schedule,
  description: {
    root: {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: 'A free weekly meditation class open to everyone, ' },
            { type: 'text', text: 'no experience needed', format: 1 },
            { type: 'text', text: '.' },
          ],
        },
      ],
    },
  },
  images: mockEventImages,
  contactPhone: '+44 20 1234 5678',
  contactName: 'Anna',
  registrationMode: 'sahaj-atlas',
  externalRegistrationUrl: null,
  registrationLimit: 30,
  registrationQuestions: {
    priorExperience: true,
    referralSource: true,
    healthInfo: null,
    accessibility: null,
    guests: null,
  },
  region: mockRegion,
  webPath: '/united-kingdom/cambridge/101',
  webUrl: 'https://atlas.example/united-kingdom/cambridge/101',
  path: '/united-kingdom/cambridge/101',
}
