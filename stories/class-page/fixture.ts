import type { Event } from '@/types'

import { DateTime } from 'luxon'

import { lexicalToText } from '@/lib/shape'
import { eventViewExamples, mockEvent, mockEventStartedCourse } from '@/mocks/events'
import { childRoute, parentOf } from '@/lib/shape/path'

// Keep the Friday named in the copy in sync with the next bookable date, including across DST.
const now = DateTime.now().setZone('Europe/London')
const friday = now
  .startOf('day')
  .plus({ days: (5 - now.weekday + 7) % 7 })
  .set({ hour: 9, minute: 30 })
const next = friday > now ? friday : friday.plus({ weeks: 1 })
const longDescription =
  `Come along on Friday mornings to meditate with us in Cambridge. We begin with a short introduction to Sahaja Yoga and a guided meditation. You may notice a moment when your thoughts go quiet and you’re still aware of the room around you. In Sahaja Yoga we call this ‘thoughtless awareness’.

If you’ve never meditated before, you’re welcome to start any week. We sit on chairs, so everyday clothes are fine and you won’t need a mat. Our meetings are free, and we’ll show you a simple meditation you can try at home between classes.`.split(
    '\n\n',
  )

export const classFixture: Event = {
  ...mockEvent,
  title: 'Friday Morning Meditation',
  schedule: {
    ...mockEvent.schedule!,
    firstDate: next.minus({ weeks: 13 }).toJSDate(),
    weekdays: ['FR'],
    upcomingDates: [next.toJSDate(), next.plus({ weeks: 1 }).toJSDate()],
  },
}
export const classPageExamples = {
  ...eventViewExamples,
  'In person': classFixture,
  'Course in progress': mockEventStartedCourse,
}
export type ClassPageExample = keyof typeof classPageExamples

export function classPageFixture(example: ClassPageExample) {
  const event: Event = classPageExamples[example] ?? classFixture
  // Several shared variants inherit the original event's URL when they override its id.
  const path = childRoute(parentOf(event.path) ?? '', event.id)

  return {
    ...event,
    path,
    webPath: event.webPath && path,
    webUrl: event.webUrl && new URL(path, event.webUrl).href,
  }
}

export function descriptionParagraphs(event: Event, short: boolean) {
  if (event.id === classFixture.id && !short) return longDescription
  const paragraphs = lexicalToText(event.description).split(/\n+/).filter(Boolean)

  return short ? paragraphs.slice(0, 1) : paragraphs
}

export const fullAddress = ({ address }: Event) =>
  [address?.street, [address?.city, address?.postCode].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ')
