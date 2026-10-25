import type { SectionKey } from './sections'
import type { ListingDraft, ListingStep, PickedPlace } from '@/lib/proposal'
import type { Event } from '@/types'
import type { GeocodingFeature } from '@mapbox/search-js-core'
import type { ReactNode } from 'react'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlignLeft, CalendarDays, Info, MapPin, Monitor, Pencil, UserRound } from 'lucide-react'

import { AboutFields, ContactFields, LanguageFields, WhenFields, WhereFields } from './fields'
import { Section } from './Section'
import { SECTION_FIELDS, sectionErrors } from './sections'

import { Button } from '@/components/atoms/Button'
import { Chip } from '@/components/atoms/Chip'
import { composeCalendarLine, useEventDisplay } from '@/hooks/use-event-display'
import { useLocale } from '@/hooks/use-locale'
import { useTheme } from '@/hooks/use-theme'
import { emptyDraft, featureToPlace, fieldsChanged, revertFields } from '@/lib/proposal'
import { viewerTimeZone } from '@/lib/time'

/** The atlas's own map styles, so the preview tile looks like the map it stands in for. */
const STATIC_STYLES = {
  light: 'sydevadmin/ck7g6nag70rn11io09f45odkq',
  dark: 'sydevadmin/cl4nw934f001j14l8jnof3a7w',
}

export type ListingEditorProps = {
  draft: ListingDraft
  /** The published class a correction opened as; absent for a new listing. */
  base?: ListingDraft | null
  /** The listing as the draft describes it, for the rendered sections. */
  listing: Event
  /** The open section, by its step name; `review` when none is. */
  open: ListingStep
  onOpen: (step: ListingStep) => void
  onChange: (patch: Partial<ListingDraft>) => void
  /** Sections whose errors a failed Done or Continue has revealed. */
  attempted: readonly SectionKey[]
  onAttempt: (key: SectionKey) => void
  proximity?: { lng: number; lat: number }
  country?: string
  timeZoneFor?: (place: PickedPlace) => string | undefined
  languageOptions?: string[]
  /** Under the address once one is picked — the view's "is it one of these?" check. */
  placeNotice?: ReactNode
  /** A correction's "it's no longer running" shortcut. */
  onStopped?: () => void
  /** Whether a live map beside the sheet already shows the pin — then no still tile is needed. */
  mapInView?: boolean
}

/**
 * The add-a-class and correction surface (#147): the listing itself, editable in place. Each
 * part reads as the published class does, or as an invitation while empty, and opens its own
 * editor where it sits. A correction is the same surface, prefilled, marking what changed.
 */
export function ListingEditor({
  draft,
  base,
  listing,
  open,
  onOpen,
  onChange,
  attempted,
  onAttempt,
  proximity,
  country,
  timeZoneFor,
  languageOptions = [],
  placeNotice,
  onStopped,
  mapInView = false,
}: ListingEditorProps) {
  const { t } = useTranslation()
  const { languageLabel } = useLocale()
  const display = useEventDisplay(listing)
  // Focus follows a visitor's own tap into a section, never the section a flow opens on — a
  // keyboard springing up on arrival would cover the listing it is meant to explain.
  const [tapped, setTapped] = useState<ListingStep | null>(null)

  const baseline = base ?? emptyDraft(draft.timeZone, draft.languages)
  const changed = (key: SectionKey) =>
    Boolean(base) && fieldsChanged(draft, base!, SECTION_FIELDS[key])
  const errorsOf = (key: SectionKey) =>
    attempted.includes(key) ? sectionErrors(key, draft, base) : {}

  const openSection = (key: ListingStep) => {
    setTapped(key)
    onOpen(key)
  }

  const done = (key: SectionKey) => {
    // The zone moves with a pick on its own, so it never counts as the visitor's input.
    const fields = SECTION_FIELDS[key].filter((field) => field !== 'timeZone')
    const touched = fieldsChanged(draft, baseline, fields)

    if (touched && Object.keys(sectionErrors(key, draft, base)).length > 0) return onAttempt(key)
    onOpen('review')
  }

  const undo = (key: SectionKey) => base && onChange(revertFields(base, SECTION_FIELDS[key]))

  const pick = (key: 'address' | 'city') => (feature: GeocodingFeature) => {
    const place = featureToPlace(feature)

    // Without a nearby class to lend one, the visitor's own zone — never one inferred earlier.
    onChange({ [key]: place, timeZone: timeZoneFor?.(place) ?? viewerTimeZone() })
  }
  // The search writes a picked label into its field without reporting it as an edit, so any
  // edit it does report means the text no longer names the pick: drop it, and ask again.
  const edit = (key: 'address' | 'city') => () => {
    if (draft[key]) onChange({ [key]: null })
  }

  // A required section left empty says what it needs in place of its hint once Continue tried.
  const emptyHint = (key: 'where' | 'when', hint: string) =>
    attempted.includes(key)
      ? t(key === 'where' ? 'submit.chrome.needs_where' : 'submit.chrome.needs_when')
      : hint

  const online = draft.eventType === 'online'
  const hasPlace = online ? Boolean(draft.city || draft.onlineUrl.trim()) : Boolean(draft.address)
  const hasContact = [
    draft.contactName,
    draft.contactPhone,
    draft.contactEmail,
    draft.website,
  ].some((value) => value.trim())

  const calendarLine = listing.schedule
    ? composeCalendarLine({
        recurrenceLine: display.recurrenceLine,
        whenLine: display.whenLine,
        time: display.eventTimeRange,
        hasNext: Boolean(display.display.next),
      })
    : null
  const calendarDetail =
    display.display.next && display.recurrenceLine ? display.whenLine : undefined
  const when = calendarLine && (
    <>
      <span className="block">{calendarLine}</span>
      {calendarDetail && <span className="block font-normal text-gray-11">{calendarDetail}</span>}
    </>
  )

  const whereText = online
    ? display.whereLine
    : [
        draft.address?.street ?? listing.address?.street,
        draft.address?.city ?? listing.address?.city,
      ]
        .filter(Boolean)
        .join(', ') || draft.address?.label
  const whereDetail = online ? safeHost(draft.onlineUrl) : draft.room.trim()

  return (
    <div className="flex flex-col gap-5 px-4 pt-1 pb-6 md:px-6">
      {base ? (
        <div className="flex flex-col gap-1 rounded-xl bg-primary-2 px-3 pt-3 pb-1.5">
          <p className="flex items-start gap-2 text-sm leading-snug text-primary-12">
            <Info aria-hidden className="mt-0.5 shrink-0 text-primary-11" size={16} />
            {t('submit.chrome.intro_correct')}
          </p>
          {onStopped && (
            <Button
              className="-ms-1 h-9 self-start px-1 text-sm underline underline-offset-2"
              color="primary"
              size="sm"
              variant="ghost"
              onClick={onStopped}
            >
              {t('submit.stopped.action')}
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm leading-snug text-gray-11">{t('submit.chrome.intro_add')}</p>
      )}

      {open === 'more' ? (
        <Section
          open
          focusOnOpen={tapped === 'more'}
          hint=""
          icon={Pencil}
          id="submit-languages"
          summary={null}
          title={t('submit.more.languages_label')}
          onDone={() => done('more')}
          onOpen={() => {}}
        >
          <LanguageFields draft={draft} languageOptions={languageOptions} onChange={onChange} />
        </Section>
      ) : (
        // The triage chips, as the published class opens with them. The type chip waits for a
        // schedule — until then there is no type to name — and only the language is a control.
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
          {listing.schedule && <Chip color="primary">{display.typeLabel}</Chip>}
          <button
            aria-label={t('submit.more.languages_edit')}
            className="group flex min-h-8 items-center gap-1.5 rounded-md text-start outline-none focus-visible:ring-2 focus-visible:ring-focus"
            type="button"
            onClick={() => openSection('more')}
          >
            {draft.languages.length > 0 && (
              <Chip color="secondary">{draft.languages.map(languageLabel).join(', ')}</Chip>
            )}
            <Pencil aria-hidden className="text-gray-10 group-hover:text-primary" size={14} />
            {!base && (
              <span className="text-xs text-gray-11">{t('submit.chrome.languages_hint')}</span>
            )}
          </button>
          <span className="flex-1" />
          {changed('more') && <ChangedTag onUndo={() => undo('more')} />}
        </div>
      )}

      <Section
        required
        aside={
          !online &&
          !mapInView &&
          draft.address?.latitude !== undefined &&
          draft.address.longitude !== undefined && (
            <StaticMap
              label={t('submit.where.map_alt', { place: draft.address.label })}
              latitude={draft.address.latitude}
              longitude={draft.address.longitude}
            />
          )
        }
        changed={changed('where')}
        focusOnOpen={tapped === 'where'}
        hint={emptyHint('where', t('submit.where.hint'))}
        icon={online ? Monitor : MapPin}
        id="submit-where"
        invalid={attempted.includes('where') && !hasPlace}
        open={open === 'where'}
        summary={
          hasPlace ? (
            <>
              <span className="block">{whereText}</span>
              {whereDetail && <span className="block font-normal text-gray-11">{whereDetail}</span>}
            </>
          ) : null
        }
        title={t('submit.where.title')}
        onDone={() => done('where')}
        onOpen={() => openSection('where')}
        onUndo={() => undo('where')}
      >
        <WhereFields
          country={country}
          draft={draft}
          errors={errorsOf('where')}
          linkKept={base?.eventType === 'online'}
          notice={placeNotice}
          proximity={proximity}
          onChange={onChange}
          onEdit={edit}
          onPick={pick}
        />
      </Section>

      <Section
        required
        changed={changed('when')}
        focusOnOpen={tapped === 'when'}
        hint={emptyHint('when', t('submit.when.hint'))}
        icon={CalendarDays}
        id="submit-when"
        invalid={attempted.includes('when') && !listing.schedule}
        open={open === 'when'}
        summary={when || null}
        title={t('submit.when.title')}
        onDone={() => done('when')}
        onOpen={() => openSection('when')}
        onUndo={() => undo('when')}
      >
        <WhenFields
          draft={draft}
          errors={errorsOf('when')}
          summary={
            <p className="flex items-start gap-2 text-sm leading-snug font-medium">
              <CalendarDays aria-hidden className="mt-0.5 shrink-0 text-primary" size={16} />
              <span>
                {when || <span className="font-normal text-gray-11">{t('submit.when.hint')}</span>}
              </span>
            </p>
          }
          onChange={onChange}
        />
      </Section>

      <Section
        changed={changed('contact')}
        focusOnOpen={tapped === 'contact'}
        hint={t('submit.contact.hint')}
        icon={UserRound}
        id="submit-contact"
        open={open === 'contact'}
        summary={
          hasContact ? (
            <>
              {[draft.contactName, draft.contactPhone, draft.contactEmail, draft.website]
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line, index) => (
                  <span key={line} className={`block ${index ? 'font-normal text-gray-11' : ''}`}>
                    {line}
                  </span>
                ))}
            </>
          ) : null
        }
        title={t('submit.contact.title')}
        onDone={() => done('contact')}
        onOpen={() => openSection('contact')}
        onUndo={() => undo('contact')}
      >
        <ContactFields draft={draft} errors={errorsOf('contact')} onChange={onChange} />
      </Section>

      <Section
        changed={changed('about')}
        focusOnOpen={tapped === 'about'}
        hint={t('submit.about.hint')}
        icon={AlignLeft}
        id="submit-about"
        open={open === 'about'}
        summary={
          draft.description.trim() ? (
            <span className="line-clamp-4 font-normal whitespace-pre-line">
              {draft.description.trim()}
            </span>
          ) : null
        }
        title={t('submit.about.title')}
        onDone={() => done('about')}
        onOpen={() => openSection('about')}
        onUndo={() => undo('about')}
      >
        <AboutFields draft={draft} onChange={onChange} />
      </Section>
    </div>
  )
}

/** A join link's host, enough to recognise it without printing a meeting's passcode. */
const safeHost = (url: string): string => {
  try {
    return url.trim() ? new URL(url.trim()).host : ''
  } catch {
    return ''
  }
}

function ChangedTag({ onUndo }: { onUndo: () => void }) {
  const { t } = useTranslation()

  return (
    <span className="flex shrink-0 items-center gap-1">
      <span className="rounded-full bg-primary-3 px-2 py-0.5 text-xs font-semibold text-primary-11">
        {t('submit.chrome.changed')}
      </span>
      <Button
        className="h-7 px-2 text-xs"
        color="neutral"
        size="sm"
        variant="ghost"
        onClick={onUndo}
      >
        {t('submit.chrome.undo')}
      </Button>
    </span>
  )
}

/**
 * The picked place as a still map tile. On a phone the sheet covers the live map, so this is
 * the only place the visitor sees their pin; a map-less embed has no live map at all.
 */
function StaticMap({
  latitude,
  longitude,
  label,
}: {
  latitude: number
  longitude: number
  label: string
}) {
  const { theme } = useTheme()
  const at = `${longitude.toFixed(5)},${latitude.toFixed(5)}`
  const src =
    `https://api.mapbox.com/styles/v1/${STATIC_STYLES[theme]}/static/` +
    `pin-l+2f8f7a(${at})/${at},15.5,0/640x256@2x` +
    `?access_token=${import.meta.env.VITE_MAPBOX_ACCESSTOKEN}&logo=false`

  return (
    <img
      alt={label}
      className="mt-2.5 block aspect-[5/2] w-full rounded-lg bg-gray-3 object-cover"
      decoding="async"
      loading="lazy"
      src={src}
    />
  )
}
