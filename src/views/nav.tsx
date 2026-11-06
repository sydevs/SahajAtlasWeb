import type { ReactNode } from 'react'

import { useMemo } from 'react'
import { Link as RouterLink, useLocation } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

import { Button } from '@/components/atoms/Button'
import { DrawerHeader } from '@/components/atoms/Drawer'
import { eventQuery, eventTitlesQuery, regionsQuery } from '@/config/api'
import { useWidgetMode } from '@/config/mode'
import { useIsWideWidget } from '@/config/responsive'
import { rememberCamera } from '@/config/store'
import { useLocale } from '@/hooks/use-locale'
import {
  backDestination,
  breadcrumbTrail,
  isFilterOverlay,
  isoCountryCode,
  resolveStack,
} from '@/lib/shape'
import { type NavNaming, backLabel, entryName } from '@/views/nav-names'
import {
  ExpandSheetButton,
  HEADER_CONTROL,
  DrawerTitle,
  MapSurfaceButton,
  useClimbInputs,
  useDrawerControl,
} from '@/views/shared'

// Region names by slug, cache-only: this renders inside the loading and error chrome too,
// where a fetch would re-issue the read that just failed. A miss costs the name, not the
// control. A country's own display name wins, the same choice RegionView's heading makes,
// so the breadcrumb and the heading it repeats can't disagree.
function useRegionNames() {
  const { regionNames: displayNames } = useLocale()
  const { data: regions } = useQuery({ ...regionsQuery(), enabled: false })

  return useMemo(
    () =>
      new Map(
        regions?.flatMap((node) => {
          const code = node.level === 'country' ? isoCountryCode(node.slug) : undefined
          const name = (code && displayNames.of(code)) || node.name

          return name ? [[node.slug, name] as const] : []
        }) ?? [],
      ),
    [regions, displayNames],
  )
}

/**
 * The way back, at the start of every header below the root. It says where it goes
 * ("Back to United Kingdom", "Back to results near Prague") because a bare arrow leaves a
 * first-time visitor guessing. It goes through the same `dismiss` as swipe and Escape, so it can never pop the
 * host page's history. `iconOnly` is for the search header, where the field needs the width
 * and a chevron beside a search box is already a familiar pattern.
 *
 * The 32px button carries a 44px touch area, which the rows above and below leave free. That
 * area is the Button atom's own `touch-target`, centred on the control. A second `after:` inset
 * here used to combine with it and shift the area up and left by half its size.
 */
export function BackButton({ iconOnly = false }: { iconOnly?: boolean }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const { hasMap } = useWidgetMode()
  const location = useLocation()
  const { dismiss } = useDrawerControl()
  const queryClient = useQueryClient()
  const regionNames = useRegionNames()
  // Cache-only, like the names: on a fresh deep link the climb passes over the venue and any
  // one-class place, and the label names where it really lands (`climbDestination`).
  const { classes, venueSlugs } = useClimbInputs()
  const route = backDestination(location, classes, venueSlugs)

  // The filters' X is the way out while they cover the calendar. Back would say "Calendar"
  // on the calendar itself: history can't say where the calendar came from until they close.
  if (!route || isFilterOverlay(resolveStack(location.pathname), hasMap)) return null

  // Register and Share read this: the class they sit on has just been loaded under this key.
  const target = resolveStack(route.split('?')[0]).at(-1)
  const title =
    target?.kind === 'event'
      ? queryClient.getQueryData<{ title?: string }>(eventQuery(target.id, locale).queryKey)?.title
      : undefined
  const titles =
    target?.kind === 'event' && title
      ? new Map([[target.id, title]])
      : queryClient.getQueryData<Map<number, string>>(eventTitlesQuery(locale).queryKey)
  const label = backLabel(route, { t: t as NavNaming['t'], regionNames, titles })

  if (iconOnly) {
    return (
      <Button {...HEADER_CONTROL} aria-label={label} className="-ms-2.5 shrink-0" onClick={dismiss}>
        <ChevronLeft className="rtl:-scale-x-100" size={20} />
      </Button>
    )
  }

  return (
    <Button
      className="-ms-2 min-w-0 justify-start gap-0.5 ps-0.5 pe-2"
      color="primary"
      size="sm"
      variant="ghost"
      onClick={dismiss}
    >
      <ChevronLeft className="shrink-0 rtl:-scale-x-100" size={20} />
      <span className="min-w-0 truncate">{label}</span>
    </Button>
  )
}

/**
 * The line that names where a page sits, on a wide panel only: United Kingdom › South East.
 *
 * A phone sheet has no room to spare. The class's time is what a visitor came for, and this
 * row is what pushed it under the Register bar, while Back and the title already say most of
 * what it would. So a phone climbs with Back.
 *
 * These are climbs, not history steps, so they use the plain router link rather than the
 * Link atom: no depth stamp, the same as the deep-link climb in DrawerStack. After tapping
 * "United Kingdom" Back says "Back to the world map", not the class just left, so the two
 * controls always agree about what is above what.
 */
export function Breadcrumbs() {
  const { t } = useTranslation()
  const location = useLocation()
  const regionNames = useRegionNames()
  const isWide = useIsWideWidget()
  const trail = breadcrumbTrail(location.pathname)

  if (!isWide || trail.length === 0) return null

  return (
    <nav aria-label={t('common.chrome.breadcrumb')} className="mt-1">
      <ol className="flex flex-wrap items-center gap-x-1 text-sm text-gray-11">
        {trail.map((entry, i) => (
          <li key={entry.path} className="flex max-w-full min-w-0 items-center gap-x-1">
            <RouterLink
              className="relative truncate rounded-sm leading-7 underline decoration-gray-7 underline-offset-2 transition-colors outline-none after:absolute after:inset-x-0 after:-inset-y-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus"
              to={entry.path}
              onClick={() => rememberCamera(location.key)}
            >
              {entryName(entry, { t: t as NavNaming['t'], regionNames })}
            </RouterLink>
            {/* After the name, so a wrapped line ends on "›" and reads as carrying on. */}
            {i < trail.length - 1 && (
              <ChevronRight
                aria-hidden
                className="shrink-0 text-gray-10 rtl:-scale-x-100"
                size={14}
              />
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

/**
 * The top row of a header below the root: Back on the left, the view's controls on the right.
 * Collapsed to the peek, those controls give way to the plain way to raise the sheet again,
 * because a drag handle is easy to miss.
 */
export function NavRow({ children }: { children?: ReactNode }) {
  const { collapsed } = useDrawerControl()
  const { t } = useTranslation()

  return (
    // The bottom margin keeps Back from reading as part of the title it sits above.
    <div className="@container mb-2 flex min-h-8 items-center justify-between gap-2">
      <BackButton />
      <div className="ms-auto flex shrink-0 items-center gap-1 empty:hidden">
        {collapsed ? (
          <ExpandSheetButton label={t('common.chrome.show_more')} />
        ) : (
          <>
            <MapSurfaceButton />
            {children}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * The one place X still means something: an overlay opened over a view, which closes back
 * onto what is still on screen behind it. Going somewhere is the Back button's job.
 */
function OverlayCloseButton() {
  const { t } = useTranslation()
  const { dismiss } = useDrawerControl()

  return (
    <Button {...HEADER_CONTROL} aria-label={t('common.chrome.close')} onClick={dismiss}>
      <X size={20} />
    </Button>
  )
}

export type NavHeaderProps = {
  title?: ReactNode
  subtitle?: ReactNode
  /** The view's own controls, on the Back row. */
  actions?: ReactNode
  breadcrumbs?: boolean
  /** An overlay over a view still on screen: a title and an X, with no Back row. */
  overlay?: boolean
}

/**
 * The header for every titled view below the root. It is the one header, so Back, the
 * controls and the title land in the same spot from view to view. The controls share the
 * Back row, so the title has the panel's full width and a long name wraps instead of being
 * cut off.
 */
export function NavHeader({
  title,
  subtitle,
  actions,
  breadcrumbs = false,
  overlay = false,
}: NavHeaderProps) {
  if (overlay) {
    return (
      <DrawerHeader className="justify-between">
        <DrawerTitle title={title} />
        <OverlayCloseButton />
      </DrawerHeader>
    )
  }

  return (
    <DrawerHeader stacked>
      <NavRow>{actions}</NavRow>
      {title && <DrawerTitle title={title} />}
      {breadcrumbs && <Breadcrumbs />}
      {subtitle && <div className="truncate text-sm text-gray-11">{subtitle}</div>}
    </DrawerHeader>
  )
}
