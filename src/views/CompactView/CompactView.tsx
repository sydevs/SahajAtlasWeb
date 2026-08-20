import { useTranslation } from 'react-i18next'

import { Button } from '@/components/atoms/Button'

/**
 * What the widget shows in a slot too small for the interface (issue #161): a heading and one
 * control that opens the whole thing somewhere it fits.
 *
 * **A view rather than a component, because it is a whole screen.** It is what the widget IS in
 * that slot — the alternative to `DrawerStack`, chosen by `decideSlot` at mount — not a piece
 * something else composes. `AppShell` renders either this or the full interface, which is the
 * same relationship every other entry in `src/views/` has.
 *
 * **The button is the view.** An earlier draft previewed two or three upcoming classes above it,
 * sized by a `compactFit` predicate that estimated a row's height in pixels. That estimate was
 * wrong the moment a title wrapped, a locale ran long, or a visitor had a larger default font —
 * and the rows cost a feed read, a titles read and a third-party IP lookup on every page view of
 * a sidebar embed nobody scrolls to. Without them **it makes no data requests at all**, which is
 * the honest shape for a screen whose whole job is to lead somewhere else.
 *
 * **It never fills its slot.** It takes the height its content needs and no more, in the host's
 * own flow, whatever box they gave. Filling was tried and is wrong in both directions: against
 * an element with no height `h-full` resolves to nothing and the view collapses to invisible,
 * and against a tall one it stretches a two-line card down 600px of empty background for no
 * reason. A card that is the size of a card is right in every slot.
 *
 * **The button is named for the task, not the product** — "Find a class near you", never the
 * widget's own name. That is the accessible name a screen-reader user hears, and it is also the
 * de-branding ratchet (#158): the atlas has to read as the host's own events feature, and the
 * one control here is the easiest place in the app to forget that. The same copy serves both
 * destinations, so there is no second key to keep in agreement across ten locales.
 */
export type CompactViewProps = {
  /**
   * What the button does. `overlay` opens the interface in place; `link` leaves for a page that
   * fits, which is what a framed embed gets because a frame cannot grow.
   *
   * A union rather than two optional props, so "neither" and "both" are unrepresentable — this
   * view exists *because* there is somewhere bigger to go, and a card with no way out is the one
   * state it must never render.
   */
  action: { kind: 'overlay'; onOpen: () => void } | { kind: 'link'; href: string }
}

export function CompactView({ action }: CompactViewProps) {
  const { t } = useTranslation('common')

  return (
    <div className="flex w-full flex-col items-center gap-2 overflow-hidden bg-background p-3 text-foreground">
      {/* Capped rather than full-bleed: a button stretched across a 1000px-wide slot reads as a
          broken layout rather than a card. */}
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
