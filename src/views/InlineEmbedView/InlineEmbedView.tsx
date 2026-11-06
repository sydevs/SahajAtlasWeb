import type { InlineMode } from '@/loader/config'
import type { OpenFullView } from './parts'

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router'
import { useTranslation } from 'react-i18next'

import { FinderCard } from './FinderCard'
import { FullView } from './FullView'
import { PreviewCard } from './PreviewCard'

import { ExpansionValueProvider } from '@/hooks/use-expansion'
import { useReportModal } from '@/config/store'
import {
  atlasPageUrl,
  frameHostOrigin,
  fullViewDepth,
  goToAtlasPage,
  hostLabel,
  openPath,
  stampDepth,
} from '@/lib/full-view'
import { requestSearchFocus } from '@/lib/pending-focus'

/**
 * PROTOTYPE (`ux/embed-inline`): an Atlas that lives inside a host's page, between paragraphs.
 *
 * Today a box of live map in the page traps the page's scroll: on a phone a finger on it pans the
 * map, and a finger below it scrolls the box's own hidden list (measured on a host's page, see the
 * proposal cards). This view puts something calm in the page instead — the finder card (`card`),
 * or a still preview of the panel (`preview`) — and opens the whole interface in a full view over
 * the page when the visitor taps.
 *
 * **History.** Opening adds one history entry (the route it opens), so the phone's Back walks
 * back through the Atlas's own steps, then closes the full view, and only then leaves the page.
 * Close goes back through those same entries, so a Back pressed after closing isn't spent on a
 * dead step. Each entry the full view owns carries its depth in `history.state` beside the
 * router's own slice, so this never depends on how either router numbers its entries. Where the
 * route is already the URL (the query router refuses to write an identical URL), a marker entry
 * stands in.
 *
 * **From inside a frame**, `openPath` picks fullscreen when the host allowed it, and otherwise
 * sends this tab to the Atlas page with a way back (`lib/full-view.ts`).
 */
export type InlineEmbedViewProps = {
  mode: InlineMode
  /** Rendered inside a host's `<iframe>` rather than the host's own document. */
  framed: boolean
  /** A visitor followed a link with a route in the page's own URL: open on load. */
  autoOpen: boolean
  /** The whole interface, rendered only while the full view is open. */
  children: ReactNode
}

export function InlineEmbedView({ mode, framed, autoOpen, children }: InlineEmbedViewProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const navigationType = useNavigationType()
  const [expanded, setExpanded] = useState(autoOpen)
  const [focus, setFocus] = useState<'panel' | 'search'>('panel')
  // How many history entries the full view has added under the current one (see `stampDepth`).
  const depth = useRef(0)
  // Opened on load from a shared link: the page's own entry is the Atlas route, so going back to it
  // keeps the full view open, and Close has no entry of its own to go back through.
  const openedOnLoad = useRef(autoOpen)
  // The navigation `open` makes is already counted; the location effect must not count it again.
  const opening = useRef(false)
  const viaFullscreen = useRef(false)
  const host = useMemo(() => hostLabel(framed), [framed])

  const finish = useCallback(() => {
    depth.current = 0
    openedOnLoad.current = false
    setExpanded(false)
    useReportModal.getState().closeReport()
    if (viaFullscreen.current && document.fullscreenElement) void document.exitFullscreen()
    viaFullscreen.current = false
  }, [])

  const close = useCallback(() => {
    // Back through every entry the full view added; the popstate below finishes the close.
    if (depth.current > 0) window.history.go(-depth.current)
    else finish()
  }, [finish])

  const open = useCallback<OpenFullView>(
    (route, nextFocus = 'panel', query = '') => {
      if (expanded) return

      const path = openPath(framed)

      if (path === 'page') {
        goToAtlasPage(
          atlasPageUrl(route, frameHostOrigin(), nextFocus === 'search' ? 'search' : undefined),
        )

        return
      }

      if (path === 'fullscreen') {
        viaFullscreen.current = true
        // Must be called inside the tap. A refusal falls back to the Atlas page, still inside the
        // tap's activation window.
        document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
          viaFullscreen.current = false
          finish()
          goToAtlasPage(atlasPageUrl(route, frameHostOrigin()))
        })
      }

      if (nextFocus === 'search') requestSearchFocus(query)

      const before = window.history.state

      navigate(route)
      // The query router writes nothing for a route that is already the URL, so a marker entry
      // stands in: the full view always owns exactly one entry to go back from.
      opening.current = window.history.state !== before
      if (!opening.current) window.history.pushState(window.history.state, '', window.location.href)
      depth.current = 1
      stampDepth(1)
      setFocus(nextFocus)
      setExpanded(true)
    },
    [expanded, finish, framed, navigate],
  )

  // Every entry the Atlas adds while open is stamped one deeper; one it replaces keeps its depth.
  const lastKey = useRef(location.key)

  useEffect(() => {
    if (lastKey.current === location.key) return
    // Kept in step while closed too. A router that updates its location in a transition (the
    // standalone page inside a frame) renders a reopen once with the old location first; a stale
    // key would spend `opening` on that render and count the open's own entry a second time, so
    // Close went back one entry too far, off the card.
    lastKey.current = location.key
    if (!expanded) return
    if (opening.current) {
      opening.current = false

      return
    }
    if (navigationType === 'PUSH') depth.current += 1
    if (navigationType !== 'POP') stampDepth(depth.current)
  }, [expanded, location.key, navigationType])

  // The phone's Back, or Close going back: an entry without a stamp is the page's own, so closed.
  useEffect(() => {
    if (!expanded) return

    const onPop = (event: PopStateEvent) => {
      const stamped = fullViewDepth(event.state)

      if (stamped > 0) depth.current = stamped
      else if (openedOnLoad.current) depth.current = 0
      else finish()
    }

    window.addEventListener('popstate', onPop)

    return () => window.removeEventListener('popstate', onPop)
  }, [expanded, finish])

  // Leaving fullscreen (Esc, Android's Back) closes the full view the same way Close does.
  useEffect(() => {
    if (!expanded) return

    const onChange = () => {
      if (viaFullscreen.current && !document.fullscreenElement) {
        viaFullscreen.current = false
        close()
      }
    }

    document.addEventListener('fullscreenchange', onChange)

    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [expanded, close])

  const expansion = useMemo(
    () => ({ expanded, expand: () => open('/'), collapse: close }),
    [expanded, open, close],
  )

  return (
    <ExpansionValueProvider value={expansion}>
      {mode === 'preview' ? <PreviewCard onOpen={open} /> : <FinderCard onOpen={open} />}
      <FullView
        focus={focus}
        host={host}
        open={expanded}
        title={t('common.chrome.widget_label')}
        topLayer={!framed}
        onClose={close}
      >
        {children}
      </FullView>
    </ExpansionValueProvider>
  )
}
