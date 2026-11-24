import type { Event } from '@/types'

import { useState, useEffect, useId, useRef } from 'react'
import { ChevronDown, ChevronLeft, MapPin } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'

import { fullAddress } from './fixture'
import { Lotus } from './Lotus'
import { ClassSharing } from './ClassSharing'

import { Button } from '@/components/atoms/Button'
import { Input } from '@/components/atoms/Input'
import { Link } from '@/components/atoms/Link'
import { Textarea } from '@/components/atoms/Textarea'
import { fieldChrome } from '@/components/atoms/Select'
import { ModalBody, ModalContent, ModalFooter } from '@/components/atoms/Modal'
import { FormField } from '@/components/molecules/FormField'
import { useEventDisplay } from '@/hooks/use-event-display'
import { useLocale } from '@/hooks/use-locale'
import { enabledQuestions, eventTimeZone } from '@/lib/shape'
// Story-only form: the class and its optional questions come from the fixture; submit stays local.
export function ClassRegistration({
  event,
  shareUrl,
  onBack,
}: {
  event: Event
  shareUrl?: string
  onBack?: () => void
}) {
  const { locale, t } = useLocale()
  const { display, whereLine } = useEventDisplay(event)
  const venue = display.online ? whereLine : fullAddress(event)
  const [open, setOpen] = useState(false)
  const formId = useId()
  const [confirmedDate, setConfirmedDate] = useState<Date | null>(null)
  const status = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (confirmedDate) status.current?.focus()
  }, [confirmedDate])
  const questions = enabledQuestions(event)
  const dates = (event.schedule?.upcomingDates ?? []).filter(
    (date) => date.getTime() >= (display.next?.toMillis() ?? 0),
  )

  if (!dates.length && display.next) dates.push(display.next.toJSDate())
  const dateFormat = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: eventTimeZone(event),
    timeZoneName: 'short',
  })
  const weekday = confirmedDate?.toLocaleDateString(locale === 'en' ? 'en-GB' : locale, {
    timeZone: eventTimeZone(event),
    weekday: 'long',
  })

  const title = confirmedDate ? (
    <span className="flex flex-col items-center gap-1 text-center">
      <Lotus />
      <span className="text-[1.875rem] leading-tight font-semibold tracking-tight">
        {locale.startsWith('en') ? `See you on ${weekday}!` : 'Registration complete'}
      </span>
    </span>
  ) : (
    'Register for free'
  )
  const content = (
    <>
      <ModalBody className="px-6! pb-5!">
        {confirmedDate ? (
          <>
            <style>{`
                @media (prefers-reduced-motion: no-preference) {
                  .class-story-welcome-lotus path {
                    transform-origin: 50% 96%;
                    animation: class-story-open-petal 620ms cubic-bezier(.2,.8,.2,1) both;
                  }
                  .class-story-welcome-lotus path:first-child { --bud-angle: 34deg; }
                  .class-story-welcome-lotus path:nth-child(2) { --bud-angle: -34deg; }
                  @keyframes class-story-open-petal {
                    from { transform: rotate(var(--bud-angle, 0deg)) scale(.87); }
                    to { transform: none; }
                  }
                }
              `}</style>
            <div ref={status} className="pb-5 text-center outline-none" role="status" tabIndex={-1}>
              <p className="mb-1 text-base font-semibold">{event.title}</p>
              <p className="text-base">{dateFormat.format(confirmedDate)}</p>
              <p className="mt-1 text-sm text-gray-11">{venue}</p>
            </div>
            {shareUrl && (
              <ClassSharing
                invitation
                nativeFirst={Boolean(onBack)}
                title={event.title}
                url={shareUrl}
              />
            )}
          </>
        ) : (
          <form
            className="flex flex-col gap-4"
            id={formId}
            onSubmit={(submit) => {
              submit.preventDefault()
              const date = new FormData(submit.currentTarget).get('session')

              if (typeof date === 'string') setConfirmedDate(new Date(date))
            }}
          >
            <div className="flex items-center gap-2 text-sm text-gray-11">
              <MapPin aria-hidden size={17} />
              {venue}
            </div>
            <FormField htmlFor={formId + '-session'} label="Your first class">
              <div className="relative">
                <select
                  required
                  className={fieldChrome({ className: 'min-h-11 appearance-none pe-10' })}
                  id={formId + '-session'}
                  name="session"
                >
                  {dates.map((date) => (
                    <option key={date.toISOString()} value={date.toISOString()}>
                      {dateFormat.format(date)}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  aria-hidden
                  className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-gray-11"
                  size={16}
                />
              </div>
            </FormField>
            <div className="grid gap-4">
              <FormField htmlFor={formId + '-name'} label={t('registration.form.name')}>
                <Input
                  required
                  autoComplete="name"
                  className="min-h-11"
                  id={formId + '-name'}
                  name="name"
                  pattern=".*[^ ].*"
                />
              </FormField>
              <FormField htmlFor={formId + '-email'} label={t('registration.form.email')}>
                <Input
                  required
                  autoComplete="email"
                  className="min-h-11"
                  id={formId + '-email'}
                  name="email"
                  type="email"
                />
              </FormField>
            </div>
            {questions.length > 0 && (
              <details open className="group border-y border-divider">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  Optional questions from the organiser
                  <ChevronDown aria-hidden className="group-open:rotate-180" size={16} />
                </summary>
                <div className="space-y-3 pb-4">
                  {questions.map((question) => (
                    <FormField
                      key={question}
                      htmlFor={formId + question}
                      label={t(`registration.questions.${question}`)}
                    >
                      <Textarea id={formId + question} name={question} rows={2} />
                    </FormField>
                  ))}
                </div>
              </details>
            )}
            <p className="text-sm leading-relaxed text-gray-11">
              By registering you agree to receive follow-up messages about this and similar events,
              in accordance with our{' '}
              <Link isExternal className="underline" href="https://wemeditate.com/privacy">
                privacy policy
              </Link>
              .
            </p>
          </form>
        )}
      </ModalBody>
      <ModalFooter className="px-6! py-4!">
        {confirmedDate ? (
          <>
            <p className="me-auto self-center text-xs text-gray-11">
              Preview only. No registration was sent.
            </p>
            <Button color="primary" onClick={onBack ?? (() => setOpen(false))}>
              Done
            </Button>
          </>
        ) : (
          <Button className="w-full" color="primary" form={formId} type="submit">
            {t('registration.form.submit')}
          </Button>
        )}
      </ModalFooter>
    </>
  )

  if (onBack)
    return (
      <main className="mx-auto w-full max-w-[640px]">
        <header className="px-6 py-4">
          <Button
            className="-ms-3 mb-2 min-h-11 gap-0.5 px-2"
            color="primary"
            variant="ghost"
            onClick={onBack}
          >
            <ChevronLeft aria-hidden size={16} /> Back to class
          </Button>
          <h1 className="text-xl font-semibold">{title}</h1>
          {!confirmedDate && <p className="text-gray-11">{event.title}</p>}
        </header>
        {content}
      </main>
    )

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) setConfirmedDate(null)
      }}
    >
      <Dialog.Trigger asChild>
        <Button
          className="w-full bg-primary-12 font-semibold text-white dark:bg-primary-9"
          color="primary"
          size="lg"
        >
          Register for free
        </Button>
      </Dialog.Trigger>
      <ModalContent
        className={
          confirmedDate
            ? 'max-w-[480px]! [&>div:first-child]:relative [&>div:first-child]:px-12 [&>div:first-child]:pt-6 [&>div:first-child>button]:absolute [&>div:first-child>button]:end-4 [&>div:first-child>button]:top-4'
            : 'max-w-[536px]! [&_h2]:text-xl [&>div:first-child]:px-6 [&>div:first-child]:pt-5'
        }
        closeLabel="Close registration"
        description={confirmedDate ? undefined : event.title}
        title={title}
      >
        {content}
      </ModalContent>
    </Dialog.Root>
  )
}
