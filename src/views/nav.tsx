import type { ReactNode } from 'react'

import { useLocation } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, X } from 'lucide-react'

import { Button } from '@/components/atoms/Button'
import { DrawerHeader } from '@/components/atoms/Drawer'
import { eventQuery, eventTitlesQuery, regionsQuery } from '@/config/api'
import { useWidgetMode } from '@/config/mode'
import { useLocale } from '@/hooks/use-locale'
import { isFilterOverlay, resolveStack } from '@/lib/shape'
import { type NavNaming, backLabel } from '@/views/nav-names'
import { DrawerTitle, ExpandSheetButton, HEADER_CONTROL, useDrawerControl } from '@/views/shared'

/**
 * The way back, at the start of every header below the root. It says where it goes ("Back to
 * United Kingdom", "Back to results near Prague"), because a bare X left visitors guessing. It
 * runs the same `dismiss` as swipe and Escape, so it can never pop the host page's history.
 * `iconOnly` is for the search header, where the field needs the width and a chevron beside a
 * search box is a familiar pattern; its label is still spoken.
 */
export function BackButton({ iconOnly = false }: { iconOnly?: boolean }) {
  // Also rendered by the loading and error chrome, so it must not suspend, and its reads are
  // cache-only: a fetch there would re-issue the read that just failed.
  const { t } = useTranslation()
  const { locale, regionNames: countryNames } = useLocale()
  const { hasMap } = useWidgetMode()
  const location = useLocation()
  const { backTo, dismiss } = useDrawerControl()
  const queryClient = useQueryClient()

  // The filters' X is the way out while they cover the calendar, and history can't say where the
  // calendar came from until they close.
  if (!backTo || isFilterOverlay(resolveStack(location.pathname), hasMap)) return null

  const regions = queryClient.getQueryData<{ slug: string; name?: string | null }[]>(
    regionsQuery().queryKey,
  )
  // Register and Share go back to a class that has just been loaded under its own key.
  const target = resolveStack(backTo.split('?')[0]).at(-1)
  const title =
    target?.kind === 'event'
      ? queryClient.getQueryData<{ title?: string }>(eventQuery(target.id, locale).queryKey)?.title
      : undefined
  const label = backLabel(backTo, {
    t: t as NavNaming['t'],
    countryName: (code) => countryNames.of(code),
    regionNames: new Map(
      regions?.flatMap((node) => (node.name ? [[node.slug, node.name] as const] : [])) ?? [],
    ),
    titles:
      target?.kind === 'event' && title
        ? new Map([[target.id, title]])
        : queryClient.getQueryData<Map<number, string>>(eventTitlesQuery(locale).queryKey),
  })

  if (iconOnly) {
    return (
      <Button {...HEADER_CONTROL} aria-label={label} className="-ms-2.5" onClick={dismiss}>
        <ChevronLeft className="rtl:-scale-x-100" size={20} />
      </Button>
    )
  }

  return (
    <Button
      className="-ms-2 min-w-0 justify-start gap-0.5 ps-0.5 pe-0"
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
 * The top row of a header below the root: Back at the start, the view's controls at the end.
 * Pulled down to the peek, those controls give way to the plain way to raise the sheet again,
 * because a drag handle is easy to miss and a keyboard can't use it.
 */
export function NavRow({ children }: { children?: ReactNode }) {
  const { collapsed } = useDrawerControl()

  return (
    // The bottom margin keeps Back from reading as part of the title below it. Back has no end
    // padding: the controls' own padding spaces them, and in the 352px panel any more cut
    // "Back to the world map" short beside four controls.
    <div className="mb-2 flex min-h-8 items-center justify-between gap-1">
      <BackButton />
      <div className="ms-auto flex shrink-0 items-center gap-1 empty:hidden">
        {collapsed ? <ExpandSheetButton /> : children}
      </div>
    </div>
  )
}

/**
 * The one place an X still means something: an overlay over a view, closing back onto what is
 * still on screen behind it. Going somewhere is Back's job.
 */
export function OverlayCloseButton({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { dismiss } = useDrawerControl()

  return (
    <Button
      {...HEADER_CONTROL}
      aria-label={t('common.chrome.close')}
      className={className}
      onClick={dismiss}
    >
      <X size={20} />
    </Button>
  )
}

export type NavHeaderProps = {
  title?: ReactNode
  subtitle?: ReactNode
  /** The view's own controls, on the Back row. */
  actions?: ReactNode
  /** An overlay over a view still on screen: a title and an X, with no Back row. */
  overlay?: boolean
}

/**
 * The header for every titled view below the root, so Back, the controls and the title land in
 * the same spot from view to view. The controls share the Back row, so the title has the panel's
 * full width and a long name wraps instead of being cut off.
 */
export function NavHeader({ title, subtitle, actions, overlay = false }: NavHeaderProps) {
  if (overlay) {
    return (
      <DrawerHeader className="justify-between">
        {title ? <DrawerTitle title={title} /> : <div />}
        <OverlayCloseButton />
      </DrawerHeader>
    )
  }

  return (
    <DrawerHeader stacked>
      <NavRow>{actions}</NavRow>
      {title && <DrawerTitle subtitle={subtitle} title={title} />}
    </DrawerHeader>
  )
}
