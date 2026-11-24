import { useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  List,
  Map as MapIcon,
  Maximize2,
  MapPin,
  X,
} from 'lucide-react'

import { MobileFooterFade } from '../shared/MobileFooterFade'
import { HostBanner } from '../shared/HostBanner'
import { WebsiteHeader } from '../class-page/WebsiteHeader'

import { DiscoveryFilters, FilterField } from './DiscoveryFilters'
import { LondonClass } from './LondonClass'
import { published, type Place } from './published'
import { Results, WeekDays, CityDirectory, SessionSummary } from './Results'
import { VenueMap, VenueMapThumbnail, type ExploredCamera } from './VenueMap'
import {
  days,
  startingPoints,
  distancesFrom,
  periodOf,
  samples,
  venuesOf,
  type Sample,
  type Session,
  type Venue,
} from './fixtures'

import { useIsWide } from '@/config/responsive'
import { Button } from '@/components/atoms/Button'
import { ToggleGroup, ToggleGroupItem } from '@/components/atoms/ToggleGroup'

function MapPanel({
  camera,
  venues,
  extent,
  classes,
  selected,
  highlighted,
  onSelect,
  onClose,
  onOpen,
}: {
  camera: React.RefObject<ExploredCamera | null>
  venues: Venue[]
  extent: Venue[]
  classes: Session[]
  selected?: Venue
  highlighted: string | null
  onSelect: (s: string) => void
  onClose: () => void
  onOpen: (s: Session) => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-gray-2">
      <div className="relative min-h-0 flex-1">
        <VenueMap
          camera={camera}
          extent={extent}
          selectedId={highlighted ?? selected?.id ?? null}
          venues={venues}
          onSelect={onSelect}
        />
      </div>
      {selected && (
        <div className="max-h-[40%] shrink-0 overflow-y-auto border-t border-divider bg-background px-4 py-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold">{selected.name}</h3>
              <p className="text-sm text-gray-11">
                {selected.street} · {selected.area}
              </p>
            </div>
            <button
              aria-label="Dismiss venue details"
              className="grid size-9 place-items-center"
              type="button"
              onClick={onClose}
            >
              <X aria-hidden size={17} />
            </button>
          </div>
          <ul className="mt-2">
            {classes
              .filter((s) => s.venue.id === selected.id)
              .map((s) => (
                <li key={s.id}>
                  <button
                    className="flex min-h-11 w-full items-center justify-between gap-2 border-t border-divider py-3 text-start"
                    type="button"
                    onClick={() => onOpen(s)}
                  >
                    <SessionSummary session={s} />
                    <ChevronRight aria-hidden size={15} />
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  )
}

const emptyFilters = { province: '', area: '', day: '', period: '', language: '' }

export type DiscoverySettings = {
  sample: Sample
  place: Place
  mapPreview: boolean
  showBanner: boolean
}

export function Discovery({ sample, place, mapPreview, showBanner }: DiscoverySettings) {
  const initialView = new URLSearchParams(window.location.search).get('view')
  const all = place === 'London' ? samples[sample] : published[place]
  const allVenues = useMemo(() => venuesOf(all), [all])
  const singleVenue = allVenues.length === 1
  const manyVenues = allVenues.length > 2
  const nearby = place === 'London' && manyVenues
  const [view, setView] = useState(() =>
    initialView === 'list'
      ? 'List'
      : initialView === 'week' || sessionStorage.getItem('london-discovery-view') === 'Week'
        ? 'Week'
        : 'List',
  )
  const [filters, setFilters] = useState(emptyFilters)
  const [selectedId, setSelected] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const [mapOpen, setMapOpen] = useState(false)
  const [detail, setDetail] = useState<Session | null>(null)
  const camera = useRef<ExploredCamera | null>(null)
  const page = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const [frame, setFrame] = useState<HTMLDivElement | null>(null)
  const desktop = useIsWide(frame)
  const thumbnail = useRef<HTMLButtonElement>(null)
  const mapOpener = useRef<HTMLElement | null>(null)
  const [pastPreview, setPastPreview] = useState(false)
  const showThumbnail = !desktop && mapPreview

  useEffect(() => {
    const root = page.current
    const preview = thumbnail.current

    if (!showThumbnail || detail || !root || !preview) return
    let threshold = 0
    const onScroll = () => setPastPreview(root.scrollTop >= threshold)
    const measure = () => {
      const headerHeight = root.querySelector('header')?.offsetHeight ?? 0

      threshold =
        root.scrollTop +
        preview.getBoundingClientRect().bottom -
        root.getBoundingClientRect().top -
        headerHeight
      onScroll()
    }
    const observer = new ResizeObserver(measure)

    measure()
    observer.observe(root)
    observer.observe(preview)
    root.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      observer.disconnect()
      root.removeEventListener('scroll', onScroll)
    }
  }, [showThumbnail, detail, showBanner])

  const week = view === 'Week'
  const distances = useMemo(
    () => distancesFrom(nearby ? filters.area : '', allVenues),
    [nearby, filters.area, allVenues],
  )
  const byPlaceTimeLanguage = useMemo(
    () =>
      all.filter(
        (s) =>
          (!filters.province || s.venue.province === filters.province) &&
          (nearby || !filters.area || s.venue.area === filters.area) &&
          (!filters.period || periodOf(s.start) === filters.period) &&
          (!filters.language || s.languages.includes(filters.language)),
      ),
    [all, nearby, filters.province, filters.area, filters.period, filters.language],
  )
  const classes = useMemo(() => {
    const matching = byPlaceTimeLanguage.filter((s) => !filters.day || filters.day === s.day)

    if (distances.size)
      matching.sort((a, b) => distances.get(a.venue.id)! - distances.get(b.venue.id)!)

    return matching
  }, [byPlaceTimeLanguage, filters.day, distances])
  const visibleVenues = useMemo(() => venuesOf(classes), [classes])
  const selected = visibleVenues.find((v) => v.id === selectedId)
  const activeFilterCount = Object.values(filters).filter(Boolean).length

  // Returning from a city restores the province the visitor was browsing.
  const parentProvince = useRef('')

  function apply(field: keyof typeof filters, value: string) {
    camera.current = null
    if (field === 'area') parentProvince.current = filters.province
    setFilters((old) => ({ ...old, ...(field === 'province' ? { area: '' } : {}), [field]: value }))
    setSelected(null)
    setHighlighted(null)
  }
  function clearFilters() {
    camera.current = null
    setFilters(emptyFilters)
    setSelected(null)
    setHighlighted(null)
  }
  function openClass(session: Session) {
    opener.current = frame?.ownerDocument.activeElement as HTMLElement | null
    setDetail(session)
  }
  function back() {
    setDetail(null)
    requestAnimationFrame(() => opener.current?.focus({ preventScroll: true }))
  }
  function openMobileMap(trigger: HTMLElement) {
    mapOpener.current = trigger
    setMapOpen(true)
  }
  function locate(id: string, trigger: HTMLElement) {
    setSelected(id)
    setHighlighted(null)
    if (!desktop) openMobileMap(trigger)
  }
  function fromPin(id: string) {
    setSelected(id)
    setHighlighted(null)
    if (desktop && !mapOpen)
      page.current?.querySelector('[data-venue="' + id + '"]')?.scrollIntoView({ block: 'nearest' })
  }
  const directory = place === 'Canada' && !filters.area
  const extent = visibleVenues.length ? visibleVenues : allVenues
  const map = (
    <MapPanel
      camera={camera}
      classes={classes}
      extent={extent}
      highlighted={highlighted}
      selected={selected}
      venues={visibleVenues}
      onClose={() => setSelected(null)}
      onOpen={openClass}
      onSelect={fromPin}
    />
  )
  const city = place === 'Canada' ? filters.area : ''
  const count = classes.length + (classes.length === 1 ? ' class' : ' classes')
  const venuesLabel = visibleVenues.length + (visibleVenues.length === 1 ? ' venue' : ' venues')
  const provinces = [...new Set(allVenues.flatMap((v) => (v.province ? [v.province] : [])))].sort()
  const venues = [
    ...new Set(
      allVenues
        .filter((v) => !filters.province || v.province === filters.province)
        .map((v) => v.area),
    ),
  ].sort()
  const languages = Array.from(new Set(all.flatMap((s) => s.languages))).sort()
  const periods = ['Morning', 'Afternoon', 'Evening'].filter((p) =>
    all.some((s) => periodOf(s.start) === p),
  )

  return (
    <div ref={setFrame} data-discovery-frame className="relative h-dvh min-w-0 [contain:layout]">
      <Dialog.Root open={mapOpen && !detail} onOpenChange={setMapOpen}>
        <div
          className="fixed inset-0 flex flex-col bg-background text-foreground [--class-host-header-height:57px]"
          hidden={!!detail}
        >
          <div ref={page} className="min-h-0 flex-1 overflow-y-auto">
            <WebsiteHeader />
            {showBanner && (
              <div className="mx-auto max-w-[1280px] min-[960px]:px-12 min-[960px]:pt-5">
                <HostBanner />
              </div>
            )}
            <section className="mx-auto max-w-[1280px] px-5 pt-6 pb-6 min-[840px]:px-12 min-[840px]:pt-9 min-[840px]:pb-12">
              {city && (
                <Button
                  color="primary"
                  variant="ghost"
                  onClick={() => {
                    camera.current = null
                    setSelected(null)
                    setHighlighted(null)
                    setFilters((current) => ({
                      ...current,
                      province: parentProvince.current,
                      area: '',
                    }))
                  }}
                >
                  <ChevronLeft aria-hidden size={16} /> Back to cities
                </Button>
              )}
              <h1 className="max-w-[840px] text-[30px] leading-[1.12] font-semibold tracking-[-0.025em] text-balance min-[840px]:text-[40px]">
                Free meditation classes in {city || place}
              </h1>
              {singleVenue && (
                <div className="mt-3 flex items-start gap-2 text-gray-11">
                  <MapPin aria-hidden className="mt-0.5 shrink-0 text-primary-11" size={18} />
                  <p>
                    <strong className="font-medium text-foreground">{allVenues[0].name}</strong>
                    {allVenues[0].name !== allVenues[0].street && ' · ' + allVenues[0].street}
                    {', ' + allVenues[0].area}
                  </p>
                </div>
              )}

              {showThumbnail && (
                <button
                  ref={thumbnail}
                  aria-haspopup="dialog"
                  aria-label={`Tap to expand map of class venues in ${place}`}
                  className="relative mt-4 block aspect-[5/2] w-full cursor-zoom-in touch-pan-y overflow-hidden rounded-lg border border-divider bg-gray-3 focus-visible:outline-offset-2"
                  type="button"
                  onClick={(e) => openMobileMap(e.currentTarget)}
                >
                  <VenueMapThumbnail extent={extent} venues={visibleVenues} />
                </button>
              )}
              <div
                className={
                  desktop
                    ? 'mt-7 grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] items-start gap-8'
                    : 'mt-5'
                }
              >
                <div className="min-w-0 self-stretch">
                  <div className="sticky top-[var(--class-host-header-height)] z-20 flex h-14 items-center justify-between gap-2 border-b border-divider bg-background">
                    {directory ? (
                      <h2 className="font-semibold">Cities</h2>
                    ) : (
                      <ToggleGroup
                        joined
                        aria-label="Browse classes"
                        type="single"
                        value={view}
                        onValueChange={(v) => {
                          if (v === 'List' || v === 'Week') {
                            setView(v)
                            sessionStorage.setItem('london-discovery-view', v)
                          }
                        }}
                      >
                        <ToggleGroupItem
                          className="h-11 gap-1.5 px-3 min-[400px]:px-5"
                          value="List"
                        >
                          <List aria-hidden size={17} />
                          List
                        </ToggleGroupItem>
                        <ToggleGroupItem
                          className="h-11 gap-1.5 px-3 min-[400px]:px-5"
                          value="Week"
                        >
                          <CalendarDays aria-hidden size={17} />
                          Week
                        </ToggleGroupItem>
                      </ToggleGroup>
                    )}
                    <DiscoveryFilters
                      active={activeFilterCount}
                      container={frame}
                      resultLabel={count}
                      onClear={clearFilters}
                    >
                      {provinces.length > 1 && (
                        <FilterField
                          any="All provinces"
                          label="Province"
                          options={provinces}
                          value={filters.province}
                          onChange={(v) => apply('province', v)}
                        />
                      )}
                      {(venues.length > 1 || filters.area) && (
                        <FilterField
                          any={place === 'Canada' ? 'All cities' : 'All areas'}
                          label={nearby ? 'Near an area' : place === 'Canada' ? 'City' : 'Area'}
                          options={nearby ? Object.keys(startingPoints) : venues}
                          value={filters.area}
                          onChange={(v) => apply('area', v)}
                        />
                      )}
                      <FilterField
                        any="Any day"
                        label="Day"
                        options={days.filter((d) => all.some((s) => s.day === d))}
                        value={filters.day}
                        onChange={(v) => apply('day', v)}
                      />
                      {periods.length > 1 && (
                        <FilterField
                          any="Any time"
                          label="Time of day"
                          options={periods}
                          value={filters.period}
                          onChange={(v) => apply('period', v)}
                        />
                      )}
                      {languages.length > 1 && (
                        <FilterField
                          any="All languages"
                          label="Language"
                          options={languages}
                          value={filters.language}
                          onChange={(v) => apply('language', v)}
                        />
                      )}
                    </DiscoveryFilters>
                  </div>
                  {week && !directory && (
                    <div className="mt-5">
                      <WeekDays
                        classes={byPlaceTimeLanguage}
                        day={filters.day}
                        setDay={(d) => apply('day', d)}
                      />
                    </div>
                  )}
                  <div className="mt-5 flex min-h-8 items-center justify-between gap-2">
                    <p aria-live="polite" className="text-sm text-gray-11">
                      {count}
                      {!singleVenue && visibleVenues.length > 0 ? ' across ' + venuesLabel : ''}
                      {filters.day && week ? ' on ' + filters.day : ''}
                    </p>
                    {activeFilterCount > 0 && (
                      <button
                        className="text-sm font-medium text-primary-11 underline underline-offset-2"
                        type="button"
                        onClick={clearFilters}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                  {place === 'Canada' && (
                    <p className="mb-2 text-sm text-gray-11">
                      {directory
                        ? 'Choose a city to see its classes.'
                        : 'Times are local to each venue.'}
                    </p>
                  )}
                  {distances.size > 0 && (
                    <p className="mb-1 px-0 text-xs text-gray-11">
                      Straight-line distance from {filters.area}
                    </p>
                  )}
                  <div className={week ? 'mt-3' : 'border-t border-divider'}>
                    {classes.length === 0 ? (
                      <p className="py-5 font-medium">No classes match these filters.</p>
                    ) : directory ? (
                      <CityDirectory
                        classes={classes}
                        onCity={(province, area) => {
                          camera.current = null
                          setSelected(null)
                          setHighlighted(null)
                          parentProvince.current = filters.province
                          setFilters((current) => ({ ...current, province, area }))
                          page.current?.scrollTo({ top: 0 })
                        }}
                      />
                    ) : (
                      <Results
                        classes={classes}
                        distances={distances}
                        selectedId={selected?.id ?? null}
                        singleVenue={singleVenue}
                        week={week}
                        onHighlight={setHighlighted}
                        onLocate={locate}
                        onOpen={openClass}
                      />
                    )}
                  </div>
                </div>
                {desktop && (
                  <aside
                    aria-label="Map of class venues"
                    className={
                      'sticky top-[73px] min-h-[250px] overflow-hidden rounded-xl border border-divider ' +
                      (manyVenues
                        ? 'h-[min(640px,calc(100dvh-96px))]'
                        : 'h-[min(390px,calc(100dvh-96px))]')
                    }
                  >
                    {!mapOpen && map}
                    <Dialog.Trigger asChild>
                      <button
                        className="absolute start-2 top-2 z-10 grid min-h-8 cursor-zoom-in place-items-start rounded focus-visible:outline-primary"
                        type="button"
                      >
                        <span className="inline-flex items-center gap-1 rounded bg-background/85 px-2 py-1 text-xs font-medium text-gray-11 shadow-sm hover:bg-background">
                          <Maximize2 aria-hidden size={13} strokeWidth={1.5} />
                          Expand map
                        </span>
                      </button>
                    </Dialog.Trigger>
                  </aside>
                )}
              </div>
            </section>
          </div>
          {!desktop && (!mapPreview || pastPreview) && (
            <div className="relative z-20 flex shrink-0 justify-center bg-background px-5 pt-2 pb-[max(8px,env(safe-area-inset-bottom))]">
              <MobileFooterFade />
              <Button
                aria-haspopup="dialog"
                className="h-11 px-5"
                color="primary"
                radius="full"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => openMobileMap(e.currentTarget)}
              >
                <MapIcon aria-hidden size={17} />
                Show map
              </Button>
            </div>
          )}
        </div>
        <Dialog.Portal container={frame}>
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed inset-0 z-50 flex flex-col bg-background text-foreground"
            onCloseAutoFocus={(e) => {
              if (!desktop && mapOpener.current) {
                e.preventDefault()
                if (!detail) mapOpener.current.focus({ preventScroll: true })
              }
            }}
          >
            {desktop ? (
              <>
                <Dialog.Title className="sr-only">{place} class venues</Dialog.Title>
                <Dialog.Close asChild>
                  <Button
                    className="absolute top-4 left-1/2 z-20 h-11 -translate-x-1/2 px-5 shadow-md"
                    color="primary"
                    radius="full"
                  >
                    <X aria-hidden size={18} />
                    Close map
                  </Button>
                </Dialog.Close>
              </>
            ) : (
              <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-divider px-4">
                <Dialog.Close asChild>
                  <Button className="-ms-2" color="primary" variant="ghost">
                    <ChevronLeft aria-hidden size={17} />
                    Back to {week ? 'week' : 'list'}
                  </Button>
                </Dialog.Close>
                <Dialog.Title className="text-sm font-medium">
                  {place} · {venuesLabel}
                </Dialog.Title>
              </div>
            )}
            {map}
          </Dialog.Content>
        </Dialog.Portal>
        {detail && (
          <LondonClass
            place={city || place}
            session={detail}
            showBanner={showBanner}
            onBack={back}
          />
        )}
      </Dialog.Root>
    </div>
  )
}
