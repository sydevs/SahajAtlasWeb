import { type ReactNode, useEffect } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'

import { DrawerBody, DrawerContent, DrawerFooter, DrawerHeader } from '@/components/atoms/Drawer'
import { RegistrationForm } from '@/components/organisms/RegistrationForm'
import { Toolbar } from '@/components/molecules/Toolbar'
import api from '@/config/api'
import { useMapController } from '@/hooks/use-map-controller'
import { isOnline, resolvePath } from '@/lib/shape'
import { Event } from '@/types'
import { BackButton } from '@/views/shared'

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
  children,
}: {
  eventPath: string
  parentPath: string
  isTop: boolean
  children?: ReactNode
}) {
  const { t } = useTranslation('events')
  const navigate = useNavigate()
  const { frameEvent } = useMapController()

  const resolved = resolvePath(eventPath)
  const id = resolved?.kind === 'event' ? resolved.id : NaN

  const { data: event } = useSuspenseQuery({
    queryKey: ['event', id],
    queryFn: () => api.getEvent(id),
  })

  useEffect(() => {
    if (isTop) frameEvent(event)
  }, [isTop, event, frameEvent])

  return (
    <DrawerContent ariaLabel={t('registration.register_now')}>
      <DrawerHeader>
        <BackButton to={parentPath} />
        <div className="truncate text-lg font-bold">
          {t('registration.register_for', { event: event.title })}
        </div>
      </DrawerHeader>
      <DrawerBody>
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
      <DrawerFooter>
        <Toolbar />
      </DrawerFooter>
      {children}
    </DrawerContent>
  )
}
