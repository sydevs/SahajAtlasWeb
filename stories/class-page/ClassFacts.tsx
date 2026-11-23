import type { ReactNode } from 'react'
import type { Event } from '@/types'

import { CalendarDays, MapPin, Copy, Check } from 'lucide-react'
import { useState, useEffect } from 'react'

import meditation from './meditate.svg'
import { fullAddress } from './fixture'

import { formatTimeRange } from '@/lib/time'
import { useLocale } from '@/hooks/use-locale'
import { useEventDisplay, composeCalendarLine } from '@/hooks/use-event-display'

function Fact({
  label,
  icon,
  children,
  detailed,
}: {
  label: string
  icon: ReactNode
  children: ReactNode
  detailed: boolean
}) {
  return (
    <div
      className={
        detailed
          ? 'grid grid-cols-[32px_minmax(0,1fr)] items-center gap-3.5 py-2.5'
          : 'grid grid-cols-[20px_minmax(0,1fr)] items-start gap-3'
      }
    >
      <span aria-hidden className="flex justify-center text-primary">
        {icon}
      </span>
      <div>
        {detailed && <p className="mb-0.5 text-sm font-normal text-gray-11">{label}</p>}
        {children}
      </div>
    </div>
  )
}
function Address({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)

    return () => window.clearTimeout(timer)
  }, [copied])

  return (
    <button
      aria-label={'Copy address: ' + value}
      className="text-start"
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
        } catch {
          /* The address remains selectable. */
        }
      }}
    >
      {value}{' '}
      <span aria-live="polite">
        {copied ? (
          <>
            <Check aria-hidden className="inline text-primary" size={14} />
            <span className="sr-only">Address copied</span>
          </>
        ) : (
          <Copy aria-hidden className="inline text-gray-9" size={14} />
        )}
      </span>
    </button>
  )
}
export function ClassFacts({ event, detailed = false }: { event: Event; detailed?: boolean }) {
  const { display, recurrenceLine, whenLine } = useEventDisplay(event)
  const { t, locale } = useLocale()
  const dateLocale = locale === 'en' ? 'en-GB' : locale
  const next = display.next
  const time = next
    ? formatTimeRange(next, display.nextEnd, dateLocale === 'en-GB' ? 'en-GB-u-hc-h12' : dateLocale)
    : null
  const nextSession = next
    ? t('event.display.next_session', {
        date: next
          .setLocale(dateLocale)
          .toLocaleString({ weekday: 'short', day: 'numeric', month: 'short' }),
      })
    : whenLine
  const size = detailed ? 32 : 20

  return (
    <div
      className={
        detailed
          ? 'text-lg leading-snug font-medium'
          : 'flex flex-col gap-2.5 leading-snug font-medium'
      }
    >
      <Fact
        detailed={detailed}
        icon={<CalendarDays size={size} strokeWidth={detailed ? 1.5 : 2} />}
        label="Class time"
      >
        {composeCalendarLine({
          recurrenceLine,
          whenLine,
          time,
          hasNext: Boolean(display.next),
        })}
        {recurrenceLine && <p className="text-sm font-normal text-gray-11">{nextSession}</p>}
      </Fact>
      <Fact
        detailed={detailed}
        icon={<MapPin size={size} strokeWidth={detailed ? 1.5 : 2} />}
        label="Location"
      >
        <Address value={fullAddress(event)} />
      </Fact>
      {detailed && (
        <Fact
          detailed
          icon={
            <span
              className="size-8 bg-current"
              style={{ mask: `url("${meditation}") center/contain no-repeat` }}
            />
          }
          label="Cost"
        >
          Always free
        </Fact>
      )}
    </div>
  )
}
