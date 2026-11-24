import type { ReactNode } from 'react'
import type { Event } from '@/types'

import { CalendarDays, MapPin, Monitor, Copy, Check } from 'lucide-react'
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
          ? 'grid grid-cols-[32px_minmax(0,1fr)] items-center gap-3.5 py-2.5 first:pt-0'
          : 'grid grid-cols-[20px_minmax(0,1fr)] items-start gap-3 has-[button]:items-center [&_button]:min-h-11'
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
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'manual'>('idle')

  useEffect(() => {
    if (copyStatus === 'idle') return
    const timer = window.setTimeout(() => setCopyStatus('idle'), 2000)

    return () => window.clearTimeout(timer)
  }, [copyStatus])

  return (
    <button
      aria-label={'Copy address: ' + value}
      className="touch-target relative text-start select-text"
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopyStatus('copied')
        } catch {
          setCopyStatus('manual')
        }
      }}
    >
      {value}{' '}
      <span aria-live="polite">
        {copyStatus === 'copied' ? (
          <>
            <Check aria-hidden className="inline text-primary" size={14} />
            <span className="ms-1 text-sm font-normal text-primary-11">Address copied</span>
          </>
        ) : copyStatus === 'manual' ? (
          <span className="text-sm font-normal text-gray-11">Select the address to copy it</span>
        ) : (
          <Copy aria-hidden className="inline text-gray-9" size={14} />
        )}
      </span>
    </button>
  )
}
export function ClassFacts({ event, detailed = false }: { event: Event; detailed?: boolean }) {
  const { display, recurrenceLine, whenLine, whereLine, whereSubtext, eventTimeRange } =
    useEventDisplay(event)
  const { t, locale } = useLocale()
  const dateLocale = locale === 'en' ? 'en-GB' : locale
  const next = display.next
  const time = next
    ? formatTimeRange(
        next,
        event.schedule?.endTime ? display.nextEnd : null,
        dateLocale === 'en-GB' ? 'en-GB-u-hc-h12' : dateLocale,
      )
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
          time: display.online ? eventTimeRange : time,
          hasNext: Boolean(display.next),
        })}
        {recurrenceLine && <p className="text-sm font-normal text-gray-11">{nextSession}</p>}
      </Fact>
      {whereLine && display.status !== 'ended' && (
        <Fact
          detailed={detailed}
          icon={
            display.online ? (
              <Monitor size={size} />
            ) : (
              <MapPin size={size} strokeWidth={detailed ? 1.5 : 2} />
            )
          }
          label="Location"
        >
          {display.actions.includes('directions') ? (
            <Address value={fullAddress(event)} />
          ) : (
            whereLine
          )}
          {whereSubtext && <p className="text-sm font-normal text-gray-11">{whereSubtext}</p>}
        </Fact>
      )}
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
