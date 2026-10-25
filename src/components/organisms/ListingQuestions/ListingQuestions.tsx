import type { UserSubmissionErrorCode } from '@/config/api/mutate'
import type { ReportContext } from '@/lib/report'
import type { ListingDraft, ListingSender, ListingStep, PickedPlace } from '@/lib/proposal'
import type { CorrectionReason, Question } from '@/lib/questions'
import type { GeocodingFeature } from '@mapbox/search-js-core'
import type { ReactNode, Ref } from 'react'
import type { SendState } from './SendForm'

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'framer-motion'
import { DateTime } from 'luxon'
import { Check, ChevronLeft } from 'lucide-react'

import {
  AboutScreen,
  ChangedScreen,
  ContactScreen,
  DayScreen,
  LanguageScreen,
  LinkScreen,
  ModeScreen,
  NoteScreen,
  OftenScreen,
  PlaceScreen,
  QuestionTitle,
  StoppedScreen,
  TimeScreen,
  clockLabel,
  weekdayDate,
} from './screens'
import { SEND_FORM_ID, SendForm } from './SendForm'

import { Button } from '@/components/atoms/Button'
import { DrawerBody, DrawerFooter, DrawerHeader } from '@/components/atoms/Drawer'
import { useLocale } from '@/hooks/use-locale'
import { draftPlace, featureToPlace } from '@/lib/proposal'
import {
  correctionQuestions,
  flowQuestions,
  nextQuestion,
  previousQuestion,
  questionErrors,
  questionProgress,
  weekdayOf,
} from '@/lib/questions'
import { viewerTimeZone } from '@/lib/time'

/** How long a tapped answer stays lit before the next question slides in. */
const CHOICE_BEAT_MS = 320

/** The questions the visitor can leave without answering. */
const SKIPPABLE: ReadonlySet<Question> = new Set(['contact', 'about'])

/** The questions whose answer is a tap, so they move on by themselves. */
const CHOSEN: ReadonlySet<Question> = new Set(['mode', 'often', 'changed'])

/** The step a refused send names, as the question whose screen holds the wrong field. */
const stepQuestion = (step: ListingStep, draft: ListingDraft, base?: ListingDraft): Question => {
  if (step === 'where') return questionErrors('link', draft, base).onlineUrl ? 'link' : 'place'
  // The first and last dates are on the day screen; the times on the next.
  if (step === 'when') return questionErrors('day', draft, base).firstDate ? 'day' : 'time'

  // The website, the one field `more` checks, sits with the contact details here.
  return 'contact'
}

export type ListingQuestionsProps = {
  /** A new listing, or a correction to the published class it names. */
  correction?: { eventId: number; baseDraft: ListingDraft; title: string }
  draft: ListingDraft
  onChange: (patch: Partial<ListingDraft>) => void
  question: Question
  /** `forward` is false for Back, so the question left does not count as answered. */
  onQuestion: (question: Question, forward?: boolean) => void
  /** The questions already moved on from: a tap question shows its answer only after one. */
  answered: Question[]
  reason: CorrectionReason | null
  onReason: (reason: CorrectionReason | null) => void
  /** Whether the last screen has been reached, after which an edit returns straight to it. */
  reviewed: boolean
  sender: ListingSender
  onSender: (patch: Partial<ListingSender>) => void
  sent: boolean
  onSent: () => void
  onClose: () => void
  context: ReportContext
  proximity?: { lng: number; lat: number }
  country?: string
  timeZoneFor?: (place: PickedPlace) => string | undefined
  /** Languages classes nearby are taught in, offered first. */
  languageOptions?: string[]
  /** Under a picked place: the view's "is it one of these?" check. */
  placeNotice?: ReactNode
  /** The schedule as the listing will read it, under the time picks. */
  scheduleSummary?: ReactNode
  /** The last screen's body: the listing preview, or what a correction changes. */
  review: ReactNode
  /** The coordinator's city, for the receipt. */
  city?: string
  /** The close control at the end of the header. */
  trailing?: ReactNode
  /** Pins the footer to the visible bottom of a phone's bottom sheet. */
  stickyFooter?: boolean
  /** Story-only: open the last screen showing this refusal. */
  initialRefusal?: UserSubmissionErrorCode | 'unknown'
}

/**
 * The add-a-class and correction flows (#147), one question per screen: tap an answer and the
 * next question slides in. A correction first asks what changed, then only what answers it.
 * It edits a draft its view owns, and the last screen shows the listing that draft becomes.
 */
export function ListingQuestions(props: ListingQuestionsProps) {
  const {
    correction,
    draft,
    onChange,
    question,
    onQuestion,
    reason,
    onReason,
    reviewed,
    sender,
    sent,
    answered,
    trailing,
    stickyFooter = false,
  } = props
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const base = correction?.baseDraft
  const questions = flowQuestions(draft, correction ? { reason } : null)
  const [attempted, setAttempted] = useState<Question | null>(null)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [send, setSend] = useState<SendState>({ ready: false, pending: false, blocked: false })
  // The question whose answer was just tapped, lit at once while the next one is on its way.
  const [tapped, setTapped] = useState<Question | null>(null)
  // A zone the visitor chose stands: a later place pick no longer infers one over it.
  const zoneChosen = useRef(false)
  // Remounted to fetch a fresh security check after the last one was blocked.
  const [sendAttempt, setSendAttempt] = useState(0)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const beat = useRef<ReturnType<typeof setTimeout>>()

  const noteMissing = question === 'note' && !sender.note.trim()
  const errors = attempted === question ? questionErrors(question, draft, base) : {}
  const blocked = (asked: Question, against = draft) =>
    Object.keys(questionErrors(asked, against, base)).length > 0 ||
    (asked === 'note' && !sender.note.trim())

  // A new screen is announced by its heading, and a refused one by its first wrong field.
  useEffect(() => {
    // Focusing scrolls the heading into view, so a long screen never opens scrolled down.
    headingRef.current?.focus()
  }, [question, sent])
  useEffect(() => {
    if (attempted !== question) return
    bodyRef.current
      ?.querySelector<HTMLElement>(
        '[aria-invalid="true"], [data-invalid] input, [data-invalid] button',
      )
      ?.focus()
  }, [attempted, question])
  useEffect(() => () => clearTimeout(beat.current), [])

  const go = (next: Question, towards: 1 | -1) => {
    clearTimeout(beat.current)
    setDirection(towards)
    setAttempted(null)
    setTapped(null)
    onQuestion(next, towards === 1)
  }

  /** Where Continue leads: on through the questions, or back to the end once it was seen. */
  const onward = (from: Question, against: Question[], nextDraft = draft): Question => {
    const next = nextQuestion(against, from)

    if (!reviewed || CHOSEN.has(from) || from === 'day') return next

    const pending = against
      .slice(against.indexOf(from) + 1)
      .find((asked) => asked !== 'review' && blocked(asked, nextDraft))

    return pending ?? 'review'
  }

  const advance = () => {
    if (blocked(question)) {
      setAttempted(question)

      return
    }
    go(onward(question, questions), 1)
  }

  /** A tapped answer: record it, let it show as chosen for a beat, then move on. */
  const choose = (patch: Partial<ListingDraft>) => {
    const nextDraft = { ...draft, ...patch }

    onChange(patch)
    setTapped(question)
    clearTimeout(beat.current)
    beat.current = setTimeout(
      () =>
        go(
          onward(question, flowQuestions(nextDraft, correction ? { reason } : null), nextDraft),
          1,
        ),
      reduceMotion ? 0 : CHOICE_BEAT_MS,
    )
  }

  // Another answer adds to the correction rather than starting it over: a host who moved venue
  // may have changed the time too, and corrects both in one go.
  const chooseReason = (next: CorrectionReason) => {
    onReason(next)
    setTapped(question)
    clearTimeout(beat.current)
    beat.current = setTimeout(
      () => go(correctionQuestions(base ?? draft, next)[1], 1),
      reduceMotion ? 0 : CHOICE_BEAT_MS,
    )
  }

  const pick = (key: 'address' | 'city') => (feature: GeocodingFeature) => {
    const place = featureToPlace(feature)

    // Without a nearby class to lend one, the visitor's own zone — never one inferred earlier,
    // and never over one the visitor chose.
    onChange(
      zoneChosen.current
        ? { [key]: place }
        : { [key]: place, timeZone: props.timeZoneFor?.(place) ?? viewerTimeZone() },
    )
  }
  // The search writes a picked label into its field without reporting it as an edit, so any
  // edit it does report means the text no longer names the pick: drop it, and ask again.
  const edit = (key: 'address' | 'city') => () => {
    if (draft[key]) onChange({ [key]: null })
  }

  const back = previousQuestion(questions, question)
  const progress = sent ? 1 : questionProgress(questions, question)

  if (sent) {
    return (
      <>
        <DrawerHeader className="flex-col items-stretch gap-3">
          <FlowBar progress={1} trailing={trailing} />
        </DrawerHeader>
        <DrawerBody className="px-5">
          <Receipt
            city={props.city ?? draftPlace(draft)?.city}
            email={sender.email}
            headingRef={headingRef}
            isCorrection={Boolean(correction)}
          />
        </DrawerBody>
        <DrawerFooter className="flex px-4 py-3" sticky={stickyFooter}>
          <Button
            className="flex-1"
            color="primary"
            size="lg"
            variant="solid"
            onClick={props.onClose}
          >
            {t('submit.ask.sent_back')}
          </Button>
        </DrawerFooter>
      </>
    )
  }

  const screen = (
    <Screen
      {...props}
      blockedNote={attempted === question && noteMissing}
      errors={errors}
      headingRef={headingRef}
      questions={questions}
      sendAttempt={sendAttempt}
      tapped={tapped}
      onAnother={() => go('changed', -1)}
      onChooseMode={(eventType) => choose({ eventType })}
      onChooseReason={chooseReason}
      onChooseRepeats={(repeats) => choose({ repeats })}
      onEdit={edit}
      onInvalid={(step) => {
        const fix = stepQuestion(step, draft, base)

        go(fix, -1)
        setAttempted(fix)
      }}
      onPick={pick}
      onSendState={setSend}
      onWeekday={(weekday) =>
        // A start already on that weekday is kept, so a class starting next month stays put.
        weekdayOf(draft.firstDate) !== weekday &&
        onChange({ firstDate: weekdayDate(weekday, draft.timeZone) })
      }
      onZone={(timeZone) => {
        zoneChosen.current = true
        onChange({ timeZone })
      }}
    />
  )

  const isLast = question === 'review'
  // A screen answered by a tap has nothing to confirm until it holds an answer.
  const hasFooter = isLast || !CHOSEN.has(question) || answered.includes(question)
  const continueLabel =
    reviewed && !CHOSEN.has(question) && onward(question, questions) === 'review'
      ? t('submit.ask.done')
      : t('submit.ask.continue')

  return (
    <>
      <DrawerHeader className="flex-col items-stretch gap-3">
        <FlowBar
          back={
            back && (
              <Button
                isIconOnly
                aria-label={t('submit.chrome.back')}
                size="sm"
                variant="ghost"
                onClick={() => go(back, -1)}
              >
                <ChevronLeft size={22} />
              </Button>
            )
          }
          progress={progress}
          trailing={trailing}
        />
        {correction ? (
          <p className="line-clamp-2 px-1 text-sm text-gray-11">
            {t('submit.correct.changed_help', { title: correction.title })}
          </p>
        ) : (
          question !== 'review' && (
            <AnswerChips
              answered={answered}
              draft={draft}
              question={question}
              onJump={(asked) => go(asked, -1)}
            />
          )
        )}
      </DrawerHeader>

      <DrawerBody className={`px-5 ${stickyFooter ? 'pb-28' : 'pb-6'}`}>
        <div ref={bodyRef} className="relative">
          <AnimatePresence custom={direction} initial={false}>
            <QuestionLayer
              key={question}
              direction={direction}
              reduceMotion={Boolean(reduceMotion)}
            >
              {screen}
            </QuestionLayer>
          </AnimatePresence>
        </div>
      </DrawerBody>

      {hasFooter && (
        <DrawerFooter className="flex items-center gap-2 px-4 py-3" sticky={stickyFooter}>
          {SKIPPABLE.has(question) && (
            <Button size="lg" variant="ghost" onClick={() => go(onward(question, questions), 1)}>
              {t('submit.chrome.skip')}
            </Button>
          )}
          {isLast && !send.ready && !send.blocked && (
            // Says why Send is not ready yet, rather than leaving a pale button to puzzle over.
            <p className="sr-only" role="status">
              {t('submit.ask.send_waiting')}
            </p>
          )}
          {isLast && send.blocked ? (
            // A blocked check cannot be sent past: say so where the Send button would be, and
            // offer a fresh check rather than a button that can never work.
            <div className="flex flex-1 flex-col gap-2">
              <p className="text-sm leading-snug text-danger-11" role="alert">
                {t('common.report.blocked')}
              </p>
              <Button
                className="flex-1"
                color="primary"
                size="lg"
                variant="bordered"
                onClick={() => setSendAttempt((attempt) => attempt + 1)}
              >
                {t('common.errors.retry')}
              </Button>
            </div>
          ) : isLast ? (
            <Button
              className="flex-1"
              color="primary"
              disabled={!send.ready}
              form={SEND_FORM_ID}
              isLoading={send.pending}
              size="lg"
              type="submit"
              variant="solid"
            >
              {send.ready ? t('submit.ask.send') : t('submit.ask.send_waiting')}
            </Button>
          ) : (
            <Button className="flex-1" color="primary" size="lg" variant="solid" onClick={advance}>
              {continueLabel}
            </Button>
          )}
        </DrawerFooter>
      )}
    </>
  )
}

/**
 * One question's layer in the slide between questions. The incoming screen keeps its place in
 * the flow and sets the height; the outgoing one lifts out over it while it leaves. Not
 * `mode="popLayout"`, whose stylesheet lands in the host's head and never reaches the widget's
 * shadow root (see `ViewLayer`).
 */
function QuestionLayer({
  direction,
  reduceMotion,
  children,
}: {
  direction: 1 | -1
  reduceMotion: boolean
  children: ReactNode
}) {
  const isPresent = useIsPresent()
  const offset = reduceMotion ? 0 : 28 * direction

  return (
    <motion.div
      animate={{ opacity: 1, x: 0 }}
      aria-hidden={isPresent ? undefined : true}
      className={isPresent ? undefined : 'pointer-events-none absolute inset-x-0 top-0'}
      exit={{ opacity: 0, x: -offset }}
      initial={{ opacity: 0, x: offset }}
      transition={{ duration: reduceMotion ? 0.1 : 0.24, ease: [0.32, 0.72, 0, 1] }}
    >
      {children}
    </motion.div>
  )
}

/** The header row: back, the progress through the questions, and close. */
function FlowBar({
  back,
  progress,
  trailing,
}: {
  back?: ReactNode
  progress: number
  trailing?: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center gap-2">
      <div className="flex size-8 shrink-0 items-center justify-center">{back}</div>
      <div
        aria-label={t('submit.ask.progress_label')}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(progress * 100)}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-4"
        role="progressbar"
      >
        <div
          className="h-full rounded-full bg-primary-9 transition-[width] duration-300 ease-out motion-reduce:transition-none"
          // A sliver shows on the first question, so the bar reads as a bar, not an empty track.
          style={{ width: `${Math.max(progress, 0.04) * 100}%` }}
        />
      </div>
      {trailing}
    </div>
  )
}

/**
 * The answers so far, as small chips under the bar — "Hove · Tuesdays · 7:30 PM" — so the
 * visitor feels the listing take shape. Each one jumps back to its question.
 */
function AnswerChips({
  draft,
  question,
  answered,
  onJump,
}: {
  draft: ListingDraft
  question: Question
  answered: Question[]
  onJump: (question: Question) => void
}) {
  const { t } = useTranslation()
  const { locale, languageLabel } = useLocale()
  const passed = new Set(answered.filter((asked) => asked !== question))
  const firstDate = DateTime.fromISO(draft.firstDate).setLocale(locale)
  const place = draftPlace(draft)
  const chips: { question: Question; label: string }[] = []

  const online = draft.eventType === 'online'

  if (passed.has('place') && place) {
    const where = place.city || place.label

    chips.push({
      question: 'place',
      label: online ? `${t('submit.where.online')} · ${where}` : where,
    })
  } else if (passed.has('mode') && online)
    chips.push({ question: 'mode', label: t('submit.where.online') })
  if (passed.has('day') && firstDate.isValid) {
    const label =
      draft.repeats === 'weekly'
        ? t('submit.ask.chip_weekly', { weekday: firstDate.toFormat('cccc') })
        : draft.repeats === 'monthly'
          ? t('submit.ask.chip_monthly')
          : firstDate.toLocaleString({ weekday: 'short', day: 'numeric', month: 'short' })

    chips.push({ question: 'day', label })
  }
  if (passed.has('time') && draft.startTime)
    chips.push({ question: 'time', label: clockLabel(draft.startTime, locale) })
  if (passed.has('language') && draft.languages.length > 0)
    chips.push({ question: 'language', label: draft.languages.map(languageLabel).join(', ') })

  if (chips.length === 0) return null

  return (
    <ul className="flex flex-wrap gap-1.5 px-1">
      {chips.map((chip) => (
        <li key={chip.question}>
          <button
            data-vaul-no-drag
            className="inline-flex h-8 max-w-[240px] items-center gap-1.5 rounded-full bg-primary-3 px-3 text-[13px] font-medium text-primary-11 transition-colors outline-none hover:bg-primary-4 focus-visible:ring-2 focus-visible:ring-focus"
            type="button"
            onClick={() => onJump(chip.question)}
          >
            <Check aria-hidden className="size-3 shrink-0" />
            <span className="truncate">{chip.label}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

type ScreenArgs = ListingQuestionsProps & {
  questions: Question[]
  errors: ReturnType<typeof questionErrors>
  blockedNote: boolean
  headingRef: Ref<HTMLHeadingElement>
  onChooseMode: (eventType: ListingDraft['eventType']) => void
  onChooseRepeats: (repeats: ListingDraft['repeats']) => void
  onChooseReason: (reason: CorrectionReason) => void
  onWeekday: Parameters<typeof DayScreen>[0]['onWeekday']
  onPick: (key: 'address' | 'city') => (feature: GeocodingFeature) => void
  onEdit: (key: 'address' | 'city') => () => void
  onInvalid: (step: ListingStep) => void
  onSendState: (state: SendState) => void
  onAnother: () => void
  onZone: (timeZone: string) => void
  tapped: Question | null
  sendAttempt: number
}

/** The screen for the current question: its heading, then its answer. */
function Screen(args: ScreenArgs) {
  const { t } = useTranslation()
  const { question, draft, errors, onChange, correction, reason } = args
  const id = `ask-${question}-title`
  const titled = (title: string, help: ReactNode, body: ReactNode) => (
    <section aria-labelledby={id} className="flex flex-col gap-6 pt-2">
      <QuestionTitle headingRef={args.headingRef} help={help} id={id} title={title} />
      {body}
    </section>
  )
  const props = { draft, errors, onChange }

  switch (question) {
    case 'mode':
      return titled(
        t('submit.ask.mode_title'),
        null,
        <ModeScreen
          draft={draft}
          picked={args.answered.includes('mode') || args.tapped === 'mode'}
          onChoose={args.onChooseMode}
        />,
      )
    case 'link':
      return titled(
        t('submit.ask.link_title'),
        t('submit.ask.link_help'),
        <LinkScreen {...props} />,
      )
    case 'place': {
      const online = draft.eventType === 'online'
      const picked = Boolean(draftPlace(draft))

      return titled(
        online
          ? t('submit.ask.city_title')
          : picked
            ? t('submit.ask.place_confirm_title')
            : t('submit.ask.place_title'),
        online ? null : picked ? null : t('submit.ask.place_help'),
        <PlaceScreen
          {...props}
          country={args.country}
          notice={args.placeNotice}
          proximity={args.proximity}
          onEdit={args.onEdit}
          onPick={args.onPick}
        />,
      )
    }
    case 'often':
      return titled(
        t('submit.ask.often_title'),
        null,
        <OftenScreen
          draft={draft}
          picked={args.answered.includes('often') || args.tapped === 'often'}
          onChoose={args.onChooseRepeats}
        />,
      )
    case 'day':
      return titled(
        {
          weekly: t('submit.ask.day_title_weekly'),
          monthly: t('submit.ask.day_title_monthly'),
          once: t('submit.ask.day_title_once'),
        }[draft.repeats],
        null,
        <DayScreen {...props} onWeekday={args.onWeekday} />,
      )
    case 'time':
      return titled(
        t('submit.ask.time_title'),
        null,
        <TimeScreen {...props} summary={args.scheduleSummary} onZone={args.onZone} />,
      )
    case 'language':
      return titled(
        t('submit.ask.language_title'),
        t('submit.ask.language_help'),
        <LanguageScreen
          draft={draft}
          languageOptions={args.languageOptions ?? []}
          onChange={onChange}
        />,
      )
    case 'contact':
      return titled(
        t('submit.contact.title'),
        t('submit.ask.contact_help'),
        <ContactScreen {...props} />,
      )
    case 'about':
      return titled(
        t('submit.ask.about_title'),
        t('submit.ask.about_help'),
        <AboutScreen draft={draft} onChange={onChange} />,
      )
    case 'changed':
      return titled(
        t('submit.correct.changed_title'),
        null,
        <ChangedScreen reason={reason} onChoose={args.onChooseReason} />,
      )
    case 'stopped':
      return titled(
        t('submit.correct.stopped_title'),
        t('submit.correct.stopped_help'),
        <StoppedScreen
          base={correction!.baseDraft}
          draft={draft}
          sender={args.sender}
          onChange={onChange}
          onSender={args.onSender}
        />,
      )
    case 'note':
      return titled(
        t('submit.correct.note_title'),
        t('submit.correct.note_help'),
        <NoteScreen
          error={args.blockedNote && t('submit.correct.note_required')}
          sender={args.sender}
          onSender={args.onSender}
        />,
      )
    case 'review':
      return titled(
        correction ? t('submit.correct.review_title') : t('submit.ask.review_title'),
        correction ? t('submit.correct.review_help') : t('submit.ask.review_help'),
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            {args.review}
            {correction && (
              <Button
                className="self-start"
                color="primary"
                size="sm"
                variant="ghost"
                onClick={args.onAnother}
              >
                {t('submit.correct.another')}
              </Button>
            )}
          </div>
          <SendForm
            key={args.sendAttempt}
            context={args.context}
            correction={correction}
            draft={draft}
            initialRefusal={args.initialRefusal}
            noteOpen={Boolean(correction)}
            notePrefix={
              args.answered.includes('stopped') ? t('submit.correct.stopped_marker') : undefined
            }
            sender={args.sender}
            onInvalid={args.onInvalid}
            onSender={args.onSender}
            onSent={args.onSent}
            onState={args.onSendState}
          />
        </div>,
      )
  }
}

/** The screen after sending: what happens next, in plain words, as the three steps it is. */
function Receipt({
  city,
  email,
  isCorrection,
  headingRef,
}: {
  city?: string
  email: string
  isCorrection: boolean
  headingRef: Ref<HTMLHeadingElement>
}) {
  const { t } = useTranslation()
  const steps = [
    city ? t('submit.ask.next_check', { city }) : t('submit.ask.next_check_no_city'),
    t('submit.ask.next_email', { email: email.trim() }),
    isCorrection ? t('submit.ask.next_changed') : t('submit.ask.next_live'),
  ]

  return (
    <div className="flex flex-col gap-8 pt-8 pb-6" role="status">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-primary-3 text-primary-11">
          <Check aria-hidden size={32} strokeWidth={2.5} />
        </span>
        <h3
          ref={headingRef}
          className="text-[22px] leading-tight font-semibold tracking-tight outline-none"
          tabIndex={-1}
        >
          {t('submit.ask.sent_title')}
        </h3>
      </div>
      <section className="flex flex-col gap-4">
        <h4 className="text-sm font-semibold tracking-wide text-gray-11 uppercase">
          {t('submit.ask.next_title')}
        </h4>
        <ol className="flex flex-col">
          {steps.map((step, index) => (
            <li key={step} className="relative flex gap-3 pb-5 last:pb-0">
              {/* The rail joining the steps, stopping at the last one. */}
              {index < steps.length - 1 && (
                <span aria-hidden className="absolute start-3.5 top-8 bottom-1 w-px bg-gray-6" />
              )}
              <span
                aria-hidden
                className="flex size-7 shrink-0 items-center justify-center rounded-full border border-gray-6 bg-background text-sm font-semibold text-gray-11"
              >
                {index + 1}
              </span>
              <p className="pt-0.5 text-[15px] leading-snug break-words">{step}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
