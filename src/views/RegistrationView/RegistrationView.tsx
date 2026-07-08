import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'

import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { RegistrationForm } from '@/components/organisms/RegistrationForm'
import { useMapController } from '@/hooks/use-map-controller'
import { isOnline } from '@/lib/shape'
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
          {t('registration.register_for', { event: event.title })}
        </div>
        <CloseButton />
      </DrawerHeader>
      <DrawerBody className="p-4">
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
