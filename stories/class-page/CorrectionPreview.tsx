import type { Event } from '@/types'

import { useContext, useEffect, useRef, useState } from 'react'
import { DateTime } from 'luxon'
import {
  CalendarClock,
  MapPin,
  UserRound,
  UserX,
  CircleOff,
  MessageSquare,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react'

import { ClassProposalContext } from './proposal'

import { Button } from '@/components/atoms/Button'
import { Input } from '@/components/atoms/Input'
import { Textarea } from '@/components/atoms/Textarea'
import { fieldChrome } from '@/components/atoms/Select'
import { FormField } from '@/components/molecules/FormField'
import { eventTimeZone, lexicalToText } from '@/lib/shape'

const reasons = {
  when: { title: 'The day or time changed', icon: CalendarClock },
  where: { title: 'It moved to a new place', icon: MapPin },
  details: { title: 'Contact or other details are wrong', icon: UserRound },
  nobody: { title: 'I went and nobody was there', icon: UserX },
  stopped: { title: 'It has stopped running', icon: CircleOff },
  other: { title: 'Something else', icon: MessageSquare },
}

type Reason = keyof typeof reasons
type Section = 'pick' | 'review' | Reason
type Field = {
  label: string
  value?: string | null
  type?: 'time' | 'date' | 'tel' | 'url' | 'textarea'
  options?: string[]
  required?: boolean
  max?: string
}
type Answers = Record<string, string>
type Suggestion = { reason: Reason; answers: Answers }

function fieldsFor(reason: Reason, event: Event, description: string): Field[] {
  const address = event.address
  const start = event.schedule?.upcomingDates?.[0]
  const date =
    start && DateTime.fromJSDate(start, { zone: eventTimeZone(event) }).setLocale('en-GB')
  const today = DateTime.local().toISODate() ?? undefined

  switch (reason) {
    case 'when':
      return [
        {
          label: 'Day of the week',
          value: date?.toFormat('cccc'),
          options: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        },
        { label: 'Start time', value: date?.toFormat('HH:mm'), type: 'time', required: true },
        { label: 'End time', value: event.schedule?.endTime, type: 'time' },
      ]
    case 'where':
      return [
        { label: 'Venue name' },
        { label: 'Street address', value: address?.street, required: true },
        { label: 'City', value: address?.city, required: true },
        { label: 'Postcode', value: address?.postCode },
        { label: 'Room or floor', value: address?.room },
      ]
    case 'details':
      return [
        { label: 'Class title', value: event.title, required: true },
        { label: 'Contact name', value: event.contactName },
        { label: 'Phone number', value: event.contactPhone, type: 'tel' },
        { label: 'Website', value: event.website, type: 'url' },
        { label: 'Class description', value: description, type: 'textarea' },
      ]
    case 'nobody':
      return [
        { label: 'When did you go? (optional)', type: 'date', max: today },
        { label: 'What happened? (optional)', type: 'textarea' },
      ]
    case 'stopped':
      return [
        { label: 'Last class (if known)', type: 'date', max: today },
        { label: 'What do you know? (optional)', type: 'textarea' },
      ]
    case 'other':
      return [{ label: 'Tell our admins', type: 'textarea', required: true }]
  }
}

function EditFields({
  fields,
  saved,
  onSave,
}: {
  fields: Field[]
  saved?: Answers
  onSave: (answers: Answers) => void
}) {
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        const form = new FormData(e.currentTarget)
        const answers: Answers = {}

        for (const field of fields) {
          const value = String(form.get(field.label) ?? '').trim()

          if (value !== (field.value ?? '')) answers[field.label] = value
        }
        onSave(answers)
      }}
    >
      {fields.map((field) => {
        const id = 'correction-' + field.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        const input = {
          id,
          name: field.label,
          required: field.required,
          defaultValue: saved?.[field.label] ?? field.value ?? '',
        }

        return (
          <FormField key={field.label} htmlFor={id} label={field.label}>
            {field.options ? (
              <select {...input} className={fieldChrome()}>
                {field.options.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            ) : field.type === 'textarea' ? (
              <Textarea {...input} rows={3} />
            ) : (
              <Input {...input} max={field.max} type={field.type ?? 'text'} />
            )}
          </FormField>
        )
      })}
      <Button color="primary" type="submit">
        Review suggestion
      </Button>
    </form>
  )
}

// Only the class and this visitor's edits take part. Completing the preview discards the draft.
export function CorrectionPreview({
  event,
  description = lexicalToText(event.description),
  onClose,
}: {
  event: Event
  description?: string
  onClose: () => void
}) {
  const [step, setStep] = useState<Section>('pick')
  const proposal = useContext(ClassProposalContext)
  const [changes, setChanges] = useState<Suggestion[]>([])
  const [sender, setSender] = useState({ email: '', note: '' })
  const [error, setError] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    heading.current?.focus()
  }, [step])

  function go(next: Section) {
    setError('')
    setStep(next)
  }
  function save(reason: Reason, answers: Answers) {
    const remaining = changes.filter((c) => c.reason !== reason)
    const noChange = Object.keys(answers).length === 0

    if (noChange && reason !== 'stopped' && reason !== 'nobody') {
      if (!changes.some((c) => c.reason === reason)) {
        setError('Change a detail before reviewing your suggestion.')

        return
      }
      setChanges(remaining)
      go(remaining.length ? 'review' : 'pick')

      return
    }
    setChanges([...remaining, { reason, answers }])
    go('review')
  }
  const title =
    step === 'pick'
      ? proposal
        ? 'Which class details need updating?'
        : 'What needs fixing?'
      : step === 'review'
        ? changes.every((c) => c.reason === 'nobody')
          ? 'Check your report'
          : 'Check your suggestion'
        : reasons[step].title

  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-col gap-4 px-6 py-6">
      <Button
        className="self-start"
        color="primary"
        variant="ghost"
        onClick={step === 'pick' ? onClose : () => go('pick')}
      >
        <ChevronLeft size={16} />
        {step === 'pick' ? 'Back to class' : 'Back'}
      </Button>
      <div>
        <h1 className="text-xl font-semibold">
          {proposal ? 'Report incorrect class details' : 'Suggest a correction'}
        </h1>
        <p className="text-gray-11">{event.title}</p>
      </div>
      <h2 ref={heading} className="scroll-mt-20 text-lg font-semibold outline-none" tabIndex={-1}>
        {title}
      </h2>
      {step === 'pick' ? (
        <>
          <p>
            Anyone who knows the class can suggest a correction. Our admins check it before anything
            changes.
          </p>
          <div className="flex flex-col gap-2">
            {(Object.keys(reasons) as Reason[]).map((key) => {
              const { icon: Icon, title } = reasons[key]

              return (
                <Button
                  key={key}
                  className="min-h-12 w-full justify-start"
                  variant="bordered"
                  onClick={() => go(key)}
                >
                  <Icon aria-hidden size={20} />
                  {title}
                  <ChevronRight aria-hidden className="ms-auto" size={16} />
                </Button>
              )
            })}
          </div>
          {changes.length > 0 && (
            <Button color="primary" onClick={() => go('review')}>
              Review changes
            </Button>
          )}
        </>
      ) : step === 'review' ? (
        <>
          {changes.map((change) => {
            const fields = fieldsFor(change.reason, event, description)

            return (
              <section
                key={change.reason}
                className="space-y-2 rounded-lg border border-divider p-3"
              >
                <h3 className="font-medium">{reasons[change.reason].title}</h3>
                {fields
                  .filter((f) => f.label in change.answers)
                  .map((field) => (
                    <dl key={field.label} className="text-sm">
                      <dt className="font-medium">{field.label}</dt>
                      {field.value && (
                        <dd className="whitespace-pre-line text-gray-11">Was: {field.value}</dd>
                      )}
                      <dd className="whitespace-pre-line">
                        {field.value ? 'Now: ' : ''}
                        {change.answers[field.label] || 'Removed'}
                      </dd>
                    </dl>
                  ))}
                <Button
                  aria-label={'Edit: ' + reasons[change.reason].title}
                  variant="ghost"
                  onClick={() => go(change.reason)}
                >
                  Edit
                </Button>
                <Button
                  aria-label={'Remove: ' + reasons[change.reason].title}
                  variant="ghost"
                  onClick={() => {
                    const remaining = changes.filter((c) => c.reason !== change.reason)

                    setChanges(remaining)
                    if (remaining.length === 0) go('pick')
                  }}
                >
                  Remove
                </Button>
              </section>
            )
          })}
          <Button className="self-start" variant="bordered" onClick={() => go('pick')}>
            Add another correction
          </Button>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              onClose()
            }}
          >
            <FormField htmlFor="correction-reply" label="Your email (private, optional)">
              <Input
                autoComplete="email"
                id="correction-reply"
                type="email"
                value={sender.email}
                onChange={(e) => setSender({ ...sender, email: e.target.value })}
              />
            </FormField>
            {!changes.some((c) => ['stopped', 'other', 'nobody'].includes(c.reason)) && (
              <FormField htmlFor="correction-note" label="A note for our admins (optional)">
                <Textarea
                  id="correction-note"
                  rows={2}
                  value={sender.note}
                  onChange={(e) => setSender({ ...sender, note: e.target.value })}
                />
              </FormField>
            )}
            <p className="text-sm text-gray-11">Preview only. Nothing will be sent.</p>
            <Button color="primary" type="submit">
              Finish preview
            </Button>
          </form>
        </>
      ) : (
        <>
          <EditFields
            key={step}
            fields={fieldsFor(step, event, description)}
            saved={changes.find((c) => c.reason === step)?.answers}
            onSave={(answers) => save(step, answers)}
          />
          {error && (
            <p className="text-sm text-danger-11" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </main>
  )
}
