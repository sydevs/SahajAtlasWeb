import { useTranslation } from 'react-i18next'

import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { EventSummary, FallbackPanel } from '@/components/molecules'
import { EventRegisterBar } from '@/components/organisms/EventDetails/EventRegister'
import { RegistrationForm } from '@/components/organisms/RegistrationForm'
import { useEventDisplay } from '@/hooks/use-event-display'
import { useMapController } from '@/hooks/use-map-controller'
import { eventTimeZone, isOnline } from '@/lib/shape'
import { Event, REGISTRATION_QUESTION_NAMES, RegistrationQuestionName } from '@/types'
import {
  CloseButton,
  DrawerTitle,
  useDrawerControl,
  useEventFromPath,
  useFrameOnTop,
} from '@/views/shared'

// The registration questions enabled on this event (each `true` boolean → a field),
// as the CMS question names so the form registers `questions.<name>` field paths.
function enabledQuestions(event: Event): RegistrationQuestionName[] {
  const questions = event.registrationQuestions

  if (!questions) return []

  return REGISTRATION_QUESTION_NAMES.filter((name) => questions[name])
}

// The registration form for an event (route `<event-path>/register`). Reached by
// the event's Register CTA and deep-linkable — so the resolver gates it: a
// closed/ended/full/inactive event renders its state message, never an
// operative form, and an external-mode event renders the link-out CTA, never
// the native form. The CMS enforces the same four refusals server-side
// (SahajCloud#601: `POST /register` answers 409 + a machine-readable `code`), so
// this gate is now the fast path rather than the only one — a submission that
// races the state change is still refused, and RegistrationForm maps the code
// back to the same copy this renders.
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
  const { dismiss } = useDrawerControl()
  const { frameEvent } = useMapController()

  const { data: event } = useEventFromPath(eventPath)
  const { display, blockedMessage } = useEventDisplay(event)

  useFrameOnTop(({ isEntry }) => frameEvent(event, { isEntry }), [event, frameEvent])

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
        <DrawerTitle
          subtitle={t('display.all_events_free')}
          title={t('registration.register_meditation')}
        />
        <CloseButton />
      </DrawerHeader>
      <DrawerBody className="p-4">
        <EventSummary event={event} />
        {open && !external ? (
          <RegistrationForm
            eventId={event.id}
            eventTitle={event.title}
            eventUrl={event.webUrl ?? window.location.href}
            initialSubmitted={initialSubmitted}
            isOnline={isOnline(event)}
            questions={enabledQuestions(event)}
            recurrenceType={event.schedule?.recurrenceType}
            timeZone={eventTimeZone(event)}
            upcomingDates={selectableDates}
            onClose={dismiss}
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
          // Full, ended, or registration closed — the class is real, it just can't be
          // joined from here. That is the same shape as every other screen with nothing to
          // act on, so it renders through the shared panel rather than as two bare
          // paragraphs: the reason in the neutral register, then ONE next step.
          //
          // Which step is the point. A person can still let someone into a full class where
          // no button of ours can, so the organiser's number leads whenever the event
          // carries one; `visibleActions` swaps in the recovery ladder ("see events in
          // <region>") only when there is nobody to call. The old `contactHelper` line said
          // "contact the host to join" in words — the CTA says it as something to press, so
          // rendering both would be saying it twice.
          <FallbackPanel
            align="start"
            contact={
              event.contactPhone
                ? { phone: event.contactPhone, name: event.contactName }
                : undefined
            }
            kind="unavailable"
            // `useEventDisplay` owns the status→copy table and its tests; this row's own
            // sentence is only the generic behind it.
            message={blockedMessage ?? undefined}
          />
        )}
      </DrawerBody>
    </>
  )
}
