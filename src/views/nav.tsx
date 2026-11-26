import type { ReactNode } from 'react'
import type { RegionNode } from '@/types'

import { useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { ChevronLeft, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/atoms/Button'
import { DrawerHeader } from '@/components/atoms/Drawer'
import { SkeletonGroup, SkeletonLine } from '@/components/organisms/Skeleton/Skeleton'
import { regionsQuery } from '@/config/api'
import { useLocale } from '@/hooks/use-locale'
import { backLabel } from '@/views/nav-names'
import {
  DrawerTitle,
  ExpandSheetButton,
  HEADER_CONTROL,
  HEADER_EDGE,
  useDrawerControl,
} from '@/views/shared'

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
  const { t, regionNames: countryNames } = useLocale()
  const { backTo, dismiss } = useDrawerControl()
  const queryClient = useQueryClient()

  if (!backTo) return null

  const label = backLabel(backTo, {
    t,
    countryName: (code) => countryNames.of(code),
    regionName: (slug) =>
      queryClient
        .getQueryData<RegionNode[]>(regionsQuery().queryKey)
        ?.find((node) => node.slug === slug)?.name ?? undefined,
  })

  if (iconOnly) {
    return (
      <Button {...HEADER_CONTROL} aria-label={label} className="-ms-2.5" onClick={dismiss}>
        <ChevronLeft className="rtl:-scale-x-100" size={20} />
      </Button>
    )
  }

  return (
    // The atom's own `sm` padding, pulled out by it so the chevron lines up with the title. The
    // glyph sits 7.5px inside its 20px box, so the icon is pulled in by about that much, which
    // leaves the same 12px of hover either side of what is drawn.
    <Button
      className="-ms-3 min-w-0 justify-start gap-0.5"
      color="primary"
      size="sm"
      variant="ghost"
      onClick={dismiss}
    >
      <ChevronLeft className="-ms-2 shrink-0 rtl:-scale-x-100" size={20} />
      <span className="min-w-0 truncate">{label}</span>
    </Button>
  )
}

/**
 * The X: the way out of a panel that covers a view rather than replacing it — the filters over
 * the calendar, and the add-a-class flow, whose listing stays live behind its step panel.
 */
export function CloseButton({ className }: { className?: string }) {
  // This renders inside the error/loading chrome, where a suspend would escape the
  // boundary and blank the widget instead of showing the failure. `useTranslation()`
  // cannot suspend: the English snapshot is bundled, and i18next initialises
  // synchronously with no backend to wait on (`config/i18n.ts`).
  const { t } = useTranslation()
  const { dismiss } = useDrawerControl()

  return (
    <Button
      {...HEADER_CONTROL}
      aria-label={t('common.chrome.close')}
      className={clsx(HEADER_EDGE, className)}
      onClick={dismiss}
    >
      <X size={20} />
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

export type NavHeaderProps = {
  title?: ReactNode
  subtitle?: ReactNode
  /** The view's own controls, on the Back row. */
  actions?: ReactNode
  /** A panel over a page (the filters): a title and an X that closes back onto the page. */
  close?: boolean
  /** The title is on its way: its line is drawn as a placeholder, outside any heading. */
  pendingTitle?: boolean
}

/**
 * The header for every titled view below the root, so Back, the controls and the title land in
 * the same spot from view to view. The controls share the Back row, so the title has the panel's
 * full width and a long name wraps instead of being cut off.
 */
export function NavHeader({
  title,
  subtitle,
  actions,
  close = false,
  pendingTitle = false,
}: NavHeaderProps) {
  // The filters' own drawer over the calendar marks its control, so its loading and error
  // chrome closes the same way.
  const { overlay } = useDrawerControl()

  // An X closes back onto what is still on screen behind it. Going somewhere is Back's job.
  if (close || overlay) {
    return (
      <DrawerHeader className="justify-between">
        {title ? <DrawerTitle title={title} /> : <div />}
        <CloseButton />
      </DrawerHeader>
    )
  }

  return (
    <DrawerHeader className="flex-col items-stretch gap-0">
      <NavRow>{actions}</NavRow>
      {pendingTitle ? (
        // No heading: a heading with nothing in it is worse than none.
        <SkeletonGroup>
          <SkeletonLine className="text-xl" width="w-1/2" />
        </SkeletonGroup>
      ) : (
        title && <DrawerTitle subtitle={subtitle} title={title} />
      )}
    </DrawerHeader>
  )
}
