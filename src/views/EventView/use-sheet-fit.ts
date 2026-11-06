import { type RefObject, useEffect } from 'react'

import { useDrawerControl } from '@/views/shared'

// The same gap the panel keeps between its rows, so the next row starts under the bar.
const FOLD_GAP = 16
// Other views open at 300px, so a class never opens shorter than they do.
const MIN_OPEN_PX = 300
// However long the title, some of the map stays visible.
const MAX_OPEN_SHARE = 0.66

/**
 * Sizes the phone sheet to what must show at its default height: the title, the facts and the
 * chips (each marked `data-sheet-fold`), plus the pinned footer. A fixed height either cut a line
 * of text in half at the footer, or left a gap above it. So the sheet ends where the content does.
 *
 * `anchor` is any element inside the view's layer, which holds both the body and the footer.
 * The details and the action row are lazy chunks, so this measures again when the DOM changes.
 */
export function useSheetFit(anchor: RefObject<HTMLElement | null>, active: boolean) {
  const { setOpenHeight } = useDrawerControl()

  useEffect(() => {
    const layer = anchor.current?.parentElement
    const sheet = layer?.closest<HTMLElement>('[data-vaul-drawer]')

    if (!active || !layer || !sheet) return

    const measure = () => {
      const folds = [...layer.querySelectorAll<HTMLElement>('[data-sheet-fold]')]
      const footer = layer.querySelector<HTMLElement>('[data-sheet-footer]')?.parentElement

      if (folds.length === 0 || !footer) return

      const box = sheet.getBoundingClientRect()
      let scrolled = 0

      for (let el = folds[0].parentElement; el && el !== layer; el = el.parentElement) {
        scrolled += el.scrollTop
      }

      const foldBottom = Math.max(...folds.map((el) => el.getBoundingClientRect().bottom))
      const wanted = foldBottom - box.top + scrolled + FOLD_GAP + footer.offsetHeight
      const cap = Math.max(MIN_OPEN_PX, box.height * MAX_OPEN_SHARE)

      setOpenHeight(Math.round(Math.min(cap, Math.max(MIN_OPEN_PX, wanted))))
    }

    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    const observer = new MutationObserver(schedule)

    observer.observe(layer, { childList: true, subtree: true, characterData: true })
    window.addEventListener('resize', schedule)
    void document.fonts?.ready.then(schedule)
    schedule()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', schedule)
      setOpenHeight(null)
    }
  }, [anchor, active, setOpenHeight])
}
