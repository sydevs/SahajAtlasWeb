import { useTranslation } from 'react-i18next'

import { Button } from '@/components/atoms/Button'

/**
 * What the widget shows in a slot too small for the interface (issue #161): a heading and one
 * control that opens the whole thing somewhere it fits.
 *
 * **The button is the card.** An earlier draft previewed two or three upcoming classes above
 * it, sized by a `compactFit` predicate that estimated a row's height in pixels. That estimate
 * was wrong the moment a title wrapped, a locale ran long, or a visitor had a larger default
 * font — and the rows cost a feed read, a titles read and a third-party IP lookup on every page
 * view of a sidebar embed nobody scrolls to. Without them **the compact card makes no data
 * requests at all**, which is the honest shape for a control whose whole job is to lead
 * somewhere else.
 *
 * **The button is named for the task, not the product** — "Find a class near you", never the
 * widget's own name. That is the accessible name a screen-reader user hears, and it is also the
 * de-branding ratchet (#158): the atlas has to read as the host's own events feature, and the
 * one control on this card is the easiest place in the app to forget that. The same copy serves
 * both destinations, so there is no second key to keep in agreement across ten locales.
 *
 * Presentational — the action arrives as a prop, so a story renders it with no providers and
 * the node lane can assert its markup.
 */
export type CompactCardProps = {
  /**
   * What the button does. `overlay` expands in place; `link` leaves for a page that fits.
   *
   * A union rather than two optional props, so "neither" and "both" are unrepresentable — this
   * card exists *because* there is somewhere bigger to go, and a card with no way out is the
   * one state it must never render.
   */
  action: { kind: 'overlay'; onOpen: () => void } | { kind: 'link'; href: string }
  /**
   * Fill the host's box, rather than taking only the height the content needs.
   *
   * True only when the host gave the element a height. `h-full` against a host who gave none
   * resolves to nothing, so the card would collapse and they would see an embed that "did not
   * render" — the theme root above is `display: contents`, so this div is the layout box in
   * their own flow.
   */
  fill: boolean
}

export function CompactCard({ action, fill }: CompactCardProps) {
  const { t } = useTranslation('common')

  return (
    <div
      className={`flex w-full flex-col items-center justify-center gap-2 overflow-hidden bg-background p-3 text-foreground${fill ? 'h-full' : ''}`}
    >
      {/* Capped rather than full-bleed: a button stretched across a 1000px-wide short slot
          reads as a broken layout rather than a card. */}
      <div className="flex w-full max-w-xs flex-col gap-2">
        {/* The same key the widget's landmark uses, deliberately: two keys for one phrase,
            differing only in casing, is a drift waiting to happen across ten locales. */}
        <h2 className="text-sm font-semibold">{t('widget.label')}</h2>
        {/* Two JSX branches, not a conditional `href`: `ButtonProps` is a discriminated union,
            so a maybe-undefined href does not narrow into the anchor arm. The anchor form is
            also why this is the `Button` atom rather than a hand-rolled <a> — `href.test.ts`
            pins the app's JSX-anchor inventory to three components, and Button is one of them,
            so its `isSafeHref` gate is inherited rather than reimplemented. */}
        {action.kind === 'link' ? (
          <Button color="primary" href={action.href} target="_blank">
            {t('compact.open')}
          </Button>
        ) : (
          <Button color="primary" onClick={action.onOpen}>
            {t('compact.open')}
          </Button>
        )}
      </div>
    </div>
  )
}
