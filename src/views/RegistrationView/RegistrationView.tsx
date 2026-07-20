import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'

import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { EventSummary } from '@/components/molecules'
import { EventRegisterBar } from '@/components/organisms/EventDetails/EventRegister'
import { RegistrationForm } from '@/components/organisms/RegistrationForm'
import { useEventDisplay } from '@/hooks/use-event-display'
import { useMapController } from '@/hooks/use-map-controller'
import { eventTimeZone, isOnline } from '@/lib/shape'
import { Event } from '@/types'
import { CloseButton, DrawerTitle, useEventFromPath, useFrameOnTop } from '@/views/shared'

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
// operative form, and an external-mode event renders the link-out CTA, never
// the native form. (Client-side gating is cosmetic until the CMS enforces it
// server-side — SahajCloud#577; POST /register currently only checks
// published/visible.)
export function RegistrationView({
  eventPath,
  parentPath,
  initialSubmitted,
}: {
  eventPath: string
  parentPath: string
  /** Preview-only: start the native form on its confirmation screen (see stories). */
  initialSubmitted?: boolean
}) {
  const { t } = useTranslation('events')
  const navigate = useNavigate()
  const { frameEvent } = useMapController()

  const { data: event } = useEventFromPath(eventPath)
  const { display, contactHelper, blockedMessage } = useEventDisplay(event)

  useFrameOnTop(() => frameEvent(event), [event, frameEvent])

  const open = display.registration === 'open'
  // Registration for an external event never happens on Atlas — a deep link
  // here gets the same link-out CTA (or closed state) as the event panel.
  const external = event.registrationMode === 'external'

  // Selectable starting dates roll past finished occurrences exactly like the
  // resolver's `next` (data cached pre-session would otherwise preselect a
  // session that already ended), falling back to the resolved next occurrence
  // when the precomputed list is empty. Courses bind to the FULL run — locked
  // to the first session.
  const nextMillis = display.next?.toMillis() ?? Number.POSITIVE_INFINITY
  let futureDates = (event.schedule?.upcomingDates ?? []).filter(
    (date) => date.getTime() >= nextMillis,
  )

  if (futureDates.length === 0 && display.next) futureDates = [display.next.toJSDate()]

  const selectableDates = display.kind === 'course' ? futureDates.slice(0, 1) : futureDates

  return (
    <>
      <DrawerHeader className="justify-between">
        <DrawerTitle title={t('registration.register_meditation')} />
        <CloseButton />
      </DrawerHeader>
      <DrawerBody className="p-4">
        <EventSummary event={event} />
        {open && !external ? (
          <RegistrationForm
            eventId={event.id}
            eventTitle={event.title}
            eventUrl={event.webUrl ?? ''}
            initialSubmitted={initialSubmitted}
            isOnline={isOnline(event)}
            questions={enabledQuestions(event)}
            timeZone={eventTimeZone(event)}
            upcomingDates={selectableDates}
            onClose={() => navigate(parentPath)}
          />
        ) : external && !blockedMessage ? (
          // Only when the external event is actually registerable — a terminal
          // (inactive / ended / closed) external event has a `blockedMessage` and no
          // register slot, so it falls through to the state message below rather than
          // rendering an empty EventRegisterBar (issue #52).
          <div className="mx-auto w-full max-w-md py-4">
            <EventRegisterBar basePath={parentPath} event={event} />
          </div>
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
