import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'

import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { RegistrationForm } from '@/components/organisms/RegistrationForm'
import { useEventDisplay } from '@/hooks/use-event-display'
import { useMapController } from '@/hooks/use-map-controller'
import { isOnline } from '@/lib/shape'
import { Event } from '@/types'
import { CloseButton, EventSummary, useEventFromPath, useFrameOnTop } from '@/views/shared'

// The registration questions enabled on this event (each `true` boolean → a field).
function enabledQuestions(event: Event): string[] {
  const questions = event.registrationQuestions

  if (!questions) return []

  return Object.entries(questions)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key)
}

// The registration form for an event (route `<event-path>/register`). Reached by
// the event's Register CTA and deep-linkable — so the resolver gates it: a
// closed/ended/full/inactive event renders its state message, never an
// operative form. (Client-side gating is cosmetic until the CMS enforces it
// server-side — SahajCloud#577; POST /register currently only checks
// published/visible.)
export function RegistrationView({
  eventPath,
  parentPath,
}: {
  eventPath: string
  parentPath: string
}) {
  const { t } = useTranslation('events')
  const navigate = useNavigate()
  const { frameEvent } = useMapController()

  const { data: event } = useEventFromPath(eventPath)
  const { display, contactHelper } = useEventDisplay(event)

  useFrameOnTop(() => frameEvent(event), [event, frameEvent])

  const open = display.registration === 'open'

  // Course registration binds to the FULL run — lock the starting date to the
  // first session instead of offering every upcoming occurrence.
  const upcomingDates = event.schedule?.upcomingDates ?? []
  const selectableDates = display.kind === 'course' ? upcomingDates.slice(0, 1) : upcomingDates

  const blockedMessage = display.full
    ? t('display.event_full')
    : display.status === 'ended'
      ? t('display.event_ended')
      : display.registration === 'closed'
        ? t('display.registration_closed')
        : t('details.contact_for_timing')

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
        {open ? (
          <RegistrationForm
            eventId={event.id}
            eventTitle={event.title}
            eventUrl={event.webUrl ?? ''}
            isOnline={isOnline(event)}
            questions={enabledQuestions(event)}
            upcomingDates={selectableDates}
            onClose={() => navigate(parentPath)}
          />
        ) : (
          <div className="mx-auto flex w-full max-w-md flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-gray-11">{blockedMessage}</p>
            {contactHelper && <p className="text-xs text-gray-11">{contactHelper}</p>}
          </div>
        )}
      </DrawerBody>
    </>
  )
}
