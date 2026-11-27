import type { ReactNode } from 'react'
import type { StackEntry } from '@/lib/shape/path'
import type { RegionLevel } from '@/types'

import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'
import clsx from 'clsx'

// ⚠ By leaf path, and no other component of the interface: the boot panel draws this before the
// interface's code has arrived, so this module sits in the eager graph.
import { RESULTS_BAND, drawer } from '@/components/atoms/Drawer/drawer-style'
import { List } from '@/components/molecules/List/List'
import { guessListsPlaces } from '@/lib/shape/hierarchy'
import { tv } from '@/styles/tv'

// The loading panel: a few generic shapes, one set for every view that loads, shared by the boot
// panel and the drawer's own loading state. Each is sized like what replaces it — a 56px place
// row, a class card's title over two lines, the field's 38px box (46px on a touch screen) — so the
// content lands where its placeholder stood. `tests/browser/skeleton.spec.ts` measures the
// list and class shapes against the views they stand for; the form, filters and calendar bodies
// are sized from their views' classes and not yet measured.

/**
 * Marks a loading placeholder. The phone sheet's fit (`useFitSnap`) holds its stop while one is in
 * the body, so the sheet moves once, when the content arrives.
 */
export const LOADING_ATTR = 'data-sy-loading'

/** Spread onto the element that wraps a placeholder. */
export const LOADING = { [LOADING_ATTR]: '' }

/**
 * Clips the scroll container a loading panel's body sits in. Nothing inside is focusable, so a
 * scrollable body is one no keyboard can scroll (axe `scrollable-region-focusable`), and its
 * placeholders are nothing to scroll to. `clip` rather than `hidden`, which is still a scroll
 * container (#326).
 */
export const LOADING_BODY_CLIP = 'overflow-y-clip'

// ── The primitives ──────────────────────────────────────────────────────────────────────────

/**
 * A group of placeholder shapes: hidden from assistive tech, pulsing unless motion is reduced. It
 * must be a real box — a `contents` wrapper draws nothing for the pulse to fade. A loading state
 * says what it waits for once, in words, beside it.
 */
export function SkeletonGroup({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div aria-hidden className={clsx('motion-safe:animate-pulse', className)}>
      {children}
    </div>
  )
}

/**
 * One line of text, at that text's own line height: `className` carries the text classes of the
 * line it stands for (`text-lg`), so the content lands where the bar was.
 */
export function SkeletonLine({
  className,
  width = 'w-1/2',
}: {
  className?: string
  width?: string
}) {
  return (
    <div className={clsx('flex items-center', className)}>
      {/* The zero-width space gives the line its real line box. */}
      {'​'}
      <span className={clsx('h-[0.75em] rounded-full bg-gray-3', width)} />
    </div>
  )
}

const block = tv({ base: 'rounded-lg bg-gray-3' })

/** Any other shape — a flag's circle, a button's box — sized by the caller. */
export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={block({ className })} />
}

// ── The panel ───────────────────────────────────────────────────────────────────────────────

/**
 * The header a view opens with: the title over the search and its location line (the first
 * screen), the field over Filters and Sort (search results), Back and a title (with the search box
 * under it on a place), or a class's own header.
 */
export type SkeletonHeaderKind = 'home' | 'search' | 'titled' | 'titled-field' | 'class'

/**
 * What fills the panel: place rows, class cards, a class page, the registration form, the filter
 * questions, or the calendar's month grid.
 */
export type SkeletonBodyKind = 'places' | 'classes' | 'class' | 'form' | 'filters' | 'calendar'

export type SkeletonShape = { header: SkeletonHeaderKind; body: SkeletonBodyKind }

/**
 * The shape of the view a route opens, or `null` for a view not worth drawing ahead of — the
 * share sheet, whose data is already on hand when it opens, so only its code is on its way and
 * its own header over a spinner says so.
 *
 * `level` is the place's, once the region tree has it.
 */
export function skeletonShape(
  entry: StackEntry | undefined,
  level?: RegionLevel,
): SkeletonShape | null {
  switch (entry?.kind) {
    case undefined:
      return { header: 'home', body: 'places' }
    case 'search':
      return { header: 'search', body: 'classes' }
    case 'region':
      return {
        header: 'titled-field',
        body: guessListsPlaces(entry.path, level) ? 'places' : 'classes',
      }
    case 'online':
      return { header: 'titled', body: 'classes' }
    case 'event':
      return { header: 'class', body: 'class' }
    case 'register':
      return { header: 'titled', body: 'form' }
    case 'filters':
      return { header: 'titled', body: 'filters' }
    case 'calendar':
      return { header: 'titled', body: 'calendar' }
    default:
      return null
  }
}

// A field's drawn height, 46px on a touch screen (`field-height` in globals.css).
const FIELD_HEIGHT = 'h-[38px] pointer-coarse:h-[46px]'

const FIELD = `flex ${FIELD_HEIGHT} min-w-0 flex-1 items-center gap-3 rounded-lg border border-divider bg-gray-2 ps-2`

/** The search field's box, greyed and holding bars, so it reads as on its way, not as a field. */
export function SkeletonField() {
  return (
    <SkeletonGroup className={FIELD}>
      <SkeletonBlock className="h-5 w-5 shrink-0 rounded-full" />
      <SkeletonLine className="flex-1 field-size" width="w-2/5" />
    </SkeletonGroup>
  )
}

/** The location line under the first screen's search, the height of the real one. */
export function SkeletonLocation() {
  return (
    <SkeletonGroup>
      <SkeletonBlock className="mt-1.5 h-9 w-full" />
    </SkeletonGroup>
  )
}

/**
 * A header's content, for a panel with no real header yet: the field and a control, a title and a
 * control (the first screen), or Back and a title.
 */
export function SkeletonHeader({ header }: { header: 'field' | 'home' | 'titled' }) {
  if (header === 'field' || header === 'home') {
    return (
      <>
        {header === 'field' ? (
          <SkeletonField />
        ) : (
          <SkeletonGroup className="min-w-0 flex-1">
            <SkeletonLine className="text-xl" width="w-3/5" />
          </SkeletonGroup>
        )}
        <SkeletonGroup className="flex h-8 w-8 shrink-0 items-center justify-center">
          <SkeletonBlock className="h-5 w-5 rounded-full" />
        </SkeletonGroup>
      </>
    )
  }

  return (
    <SkeletonGroup>
      <div className="mb-2 flex min-h-8 items-center">
        <SkeletonLine className="text-sm" width="w-36" />
      </div>
      <SkeletonLine className="text-xl" width="w-1/2" />
    </SkeletonGroup>
  )
}

const ROW = 'flex items-center gap-1 px-gutter'
const CHEVRON = <ChevronRight className="shrink-0 text-gray-9 rtl:-scale-x-100" size={20} />

function PlaceRows() {
  return (
    <List>
      {['w-2/5', 'w-1/2', 'w-1/3', 'w-2/5', 'w-1/4', 'w-1/3'].map((width, row) => (
        <li key={row} className={clsx(ROW, 'min-h-14 py-3')}>
          <SkeletonLine className="flex-grow text-lg" width={width} />
          <SkeletonLine className="me-1 text-sm" width="w-5" />
          {CHEVRON}
        </li>
      ))}
    </List>
  )
}

function ClassCards() {
  return (
    <List>
      {['w-3/5', 'w-4/5', 'w-1/2', 'w-2/3'].map((width) => (
        <li key={width} className={clsx(ROW, 'py-4')}>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <SkeletonLine className="text-lg" width={width} />
            <div className="mt-0.5 mb-1 flex flex-col gap-1.5">
              <SkeletonLine className="min-h-5.5 text-sm" width="w-1/2" />
              <SkeletonLine className="min-h-5.5 text-sm" width="w-2/5" />
            </div>
          </div>
          {CHEVRON}
        </li>
      ))}
    </List>
  )
}

/** A class's page below its title: chips, the when and where, Register, then its words. */
function ClassPage({ cta }: { cta: boolean }) {
  return (
    <div className="flex flex-col gap-4 px-gutter pt-2 pb-10">
      <div className="flex gap-1">
        <SkeletonBlock className="h-5 w-24" />
        <SkeletonBlock className="h-5 w-16" />
      </div>
      <div className="mb-2 flex flex-col gap-2.5">
        <SkeletonLine className="text-base leading-snug" width="w-3/5" />
        <SkeletonLine className="text-base leading-snug" width="w-1/2" />
      </div>
      {cta && <SkeletonBlock className="h-12 w-full" />}
      <div className="flex flex-col gap-2">
        <SkeletonLine className="text-sm leading-snug" width="w-full" />
        <SkeletonLine className="text-sm leading-snug" width="w-4/5" />
      </div>
    </div>
  )
}

/** One question of a form: its label line over the control's box. */
function Question({ children, width }: { children?: ReactNode; width: string }) {
  return (
    <div className="flex flex-col gap-1">
      <SkeletonLine className="text-sm" width={width} />
      {children}
    </div>
  )
}

const CONTROL = `${FIELD_HEIGHT} w-full`

/** The registration form below its title: the class's summary card, then a labelled field each. */
function RegistrationPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-gutter py-4">
      <SkeletonBlock className="h-24 w-full" />
      <Question width="w-24">
        <SkeletonBlock className={CONTROL} />
      </Question>
      <Question width="w-32">
        <SkeletonBlock className={CONTROL} />
      </Question>
      <Question width="w-20">
        <SkeletonBlock className="h-24 w-full" />
      </Question>
    </div>
  )
}

/** The filter questions in their order: where, format, days, then the times of day stacked. */
function FilterPage() {
  return (
    <div className="flex flex-col gap-5 px-gutter py-4">
      <Question width="w-16">
        <SkeletonBlock className={CONTROL} />
      </Question>
      <Question width="w-24">
        <div className="grid grid-cols-2 gap-2">
          <SkeletonBlock className="h-11" />
          <SkeletonBlock className="h-11" />
        </div>
      </Question>
      <Question width="w-12">
        <SkeletonBlock className="h-11 w-full" />
      </Question>
      <Question width="w-20">
        <div className="flex flex-col gap-2">
          <SkeletonBlock className="h-11 w-full" />
          <SkeletonBlock className="h-11 w-full" />
          <SkeletonBlock className="h-11 w-full" />
        </div>
      </Question>
    </div>
  )
}

/** The month grid below the calendar's header: a weekday row over five rows of days. */
function CalendarPage() {
  return (
    <div className="flex flex-col gap-2 px-gutter py-2">
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }, (_, day) => (
          <SkeletonLine key={day} className="justify-center text-xs" width="w-6" />
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }, (_, day) => (
          <SkeletonBlock key={day} className="h-14" />
        ))}
      </div>
    </div>
  )
}

/**
 * What fills a loading panel, marked loading so the phone sheet holds still until the content
 * arrives (`useFitSnap`), and announced once, in words.
 *
 * `cta` draws Register in the class page's flow; leave it off where Register pins to the phone
 * sheet's foot once the class arrives.
 */
export function SkeletonBody({ body, cta = true }: { body: SkeletonBodyKind; cta?: boolean }) {
  const { t } = useTranslation()

  return (
    <div {...LOADING}>
      <p className="sr-only" role="status">
        {t(
          body === 'places' || body === 'classes' || body === 'calendar'
            ? 'common.a11y.finding_classes'
            : 'common.a11y.loading',
        )}
      </p>
      <SkeletonGroup>
        {body === 'places' && <PlaceRows />}
        {body === 'classes' && <ClassCards />}
        {body === 'class' && <ClassPage cta={cta} />}
        {body === 'form' && <RegistrationPage />}
        {body === 'filters' && <FilterPage />}
        {body === 'calendar' && <CalendarPage />}
      </SkeletonGroup>
    </div>
  )
}

export interface SkeletonProps {
  /** The view's shape (`skeletonShape`). With none, a titled header over an empty body. */
  shape: SkeletonShape | null
  /** As on `SkeletonBody`. */
  cta?: boolean
  /** The drawer it stands in for: the side panel, or the phone sheet, whose header sits closer to its handle. */
  direction?: 'left' | 'bottom'
}

/**
 * A whole loading panel's content, in the drawer's own bands — header, the search band, body — for
 * a panel that has nothing real on screen yet (the boot panel). A view loading inside the drawer
 * keeps its real header and draws only `SkeletonBody`.
 */
export function Skeleton({ shape, cta, direction = 'left' }: SkeletonProps) {
  const header = shape?.header ?? 'titled'
  const panel = drawer({ direction, mode: 'anchored' })

  return (
    <>
      {header === 'class' ? (
        // EventView's own header (`EventHeader`), not the drawer's header band.
        <div className="flex shrink-0 flex-col px-gutter pt-1 pb-2 md:pt-4" data-band="header">
          <SkeletonHeader header="titled" />
        </div>
      ) : (
        <div
          className={panel.header({
            className:
              header === 'search'
                ? undefined
                : header === 'home'
                  ? 'justify-between'
                  : 'flex-col items-stretch gap-0',
          })}
          data-band="header"
        >
          <SkeletonHeader
            header={header === 'search' ? 'field' : header === 'home' ? 'home' : 'titled'}
          />
        </div>
      )}
      {header === 'search' && (
        // SearchView's Filters and Sort, in their list toolbar.
        <div className={panel.toolbar()} data-band="toolbar">
          <SkeletonGroup className="flex items-center justify-between gap-2 px-[calc(var(--spacing-gutter)_-_12px)] py-1">
            <SkeletonBlock className="h-8 w-24" />
            <SkeletonBlock className="h-8 w-24" />
          </SkeletonGroup>
        </div>
      )}
      {(header === 'titled-field' || header === 'home') && (
        <div
          className={panel.toolbar({ className: `${RESULTS_BAND} px-gutter pb-2` })}
          data-band="toolbar"
        >
          <SkeletonField />
          {header === 'home' && <SkeletonLocation />}
        </div>
      )}
      <div className={panel.body({ className: LOADING_BODY_CLIP })} data-band="body">
        {shape && <SkeletonBody body={shape.body} cta={cta} />}
      </div>
    </>
  )
}
