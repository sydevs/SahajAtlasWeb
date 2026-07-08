import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { DateTime } from 'luxon'

import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { RegistrationForm } from '@/components/organisms/RegistrationForm'
import { useMapController } from '@/hooks/use-map-controller'
import { useLocale } from '@/hooks/use-locale'
import { isOnline, nextOccurrence } from '@/lib/shape'
import { Event } from '@/types'
import { CloseButton, useEventFromPath, useFrameOnTop } from '@/views/shared'

// The registration questions enabled on this event (each `true` boolean → a field).
function enabledQuestions(event: Event): string[] {
  const questions = event.registrationQuestions

  if (!questions) return []

  return Object.entries(questions)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key)
}

// A compact summary of the event being registered for — title, location, and
// recurrence — shown above the form so the core details stay in view while filling it.
function EventSummary({ event }: { event: Event }) {
  const { t } = useTranslation('events')
  const { locale } = useLocale()

  const online = isOnline(event)
  const next = nextOccurrence(event)
  const recurrence = event.schedule?.recurrenceType
  const nextDate = next ? DateTime.fromJSDate(next).setLocale(locale) : null

  const address = online
    ? t('details.hosted_from', {
        city: event.address?.city ?? event.region.name ?? event.region.slug,
      })
    : [event.address?.street, event.address?.city].filter(Boolean).join(', ') ||
      event.region.name ||
      event.region.slug

  return (
    <div className="mx-auto mb-4 w-full max-w-md border-b border-divider pb-4">
      <div className="text-lg font-semibold leading-tight">{event.title}</div>
      <div className="mt-1 text-sm text-gray-11">{address}</div>
      <div className="mt-1 text-xs uppercase text-gray-11">
        {recurrence
          ? t(`recurrence.${recurrence.toLowerCase()}`, {
              weekday: nextDate?.toLocaleString({ weekday: 'long' }) ?? '',
            })
          : t('details.contact_for_timing')}
      </div>
    </div>
  )
}

// The registration form for an event (route `<event-path>/register`). Reached by
// the event's Register CTA and deep-linkable. Closing returns to the event.
export function RegistrationView({
  eventPath,
  parentPath,
  isTop,
}: {
  eventPath: string
  parentPath: string
  isTop: boolean
}) {
  const { t } = useTranslation('events')
  const navigate = useNavigate()
  const { frameEvent } = useMapController()

  const { data: event } = useEventFromPath(eventPath)

  useFrameOnTop(isTop, () => frameEvent(event), [event, frameEvent])

  return (
    <>
      <DrawerHeader className="justify-between">
        <div className="min-w-0 truncate text-lg font-bold">
          {t('registration.register_meditation')}
        </div>
        <CloseButton />
      </DrawerHeader>
      <DrawerBody className="p-4">
        <EventSummary event={event} />
        <RegistrationForm
          eventId={event.id}
          eventTitle={event.title}
          eventUrl={event.webUrl ?? ''}
          isOnline={isOnline(event)}
          questions={enabledQuestions(event)}
          upcomingDates={event.schedule?.upcomingDates ?? []}
          onClose={() => navigate(parentPath)}
        />
      </DrawerBody>
    </>
  )
}
