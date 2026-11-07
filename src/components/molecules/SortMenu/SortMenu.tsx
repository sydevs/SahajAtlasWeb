import type { SortOrder } from '@/lib/shape'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown } from 'lucide-react'

import { frameCollision, menuChrome } from '@/lib/overlay'
import { Button } from '@/components/atoms/Button'
import { useSetSortOrder, useSortOrder } from '@/hooks/use-sort'
import { SORT_ORDERS } from '@/lib/shape'
import { overlayContainer } from '@/lib/overlay'

// SettingsMenu lays its rows out the same way. They share no base component — only the skin.
const { surface, row } = menuChrome()
const menu = surface()
const item = row()

// The radio checkmark in a fixed-width slot, so labels line up whether or not the row
// is the current choice.
function ItemCheck() {
  return (
    <span className="flex w-4 shrink-0 justify-center">
      <DropdownMenu.ItemIndicator>
        <Check className="text-primary" size={16} />
      </DropdownMenu.ItemIndicator>
    </span>
  )
}

/**
 * The results-list sort selector: a ghost trigger showing `Sort:
 * <current>` with a caret, opening a radio menu of the orderings
 * (Recommended, Closest, Soonest) with a checkmark on the active one. It
 * reads and writes `?sort=`. This is presentation only, so picking an
 * order re-sorts the visible list without refetching (see `EventsList`).
 * This is built directly on Radix DropdownMenu (RadioGroup and
 * ItemIndicator), instead of the Dropdown or Select atoms, which do not
 * model a checked selection. SettingsMenu makes the same choice.
 */
export function SortMenu() {
  const { t } = useTranslation()
  const order = useSortOrder()
  const setOrder = useSetSortOrder()
  const container = overlayContainer()

  // `modal={false}`: this menu opens inside the draggable vaul drawer.
  // Radix's default modal scroll-lock and body pointer-events trap fight
  // the sheet's own drag and scroll.
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <Button size="sm" variant="ghost">
          <span>
            {t('search.sort.label')}: {t(`search.sort.${order}`)}
          </span>
          <ChevronDown size={16} />
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal container={container}>
        <DropdownMenu.Content align="end" className={menu} sideOffset={8} {...frameCollision()}>
          <DropdownMenu.RadioGroup
            value={order}
            onValueChange={(value) => setOrder(value as SortOrder)}
          >
            {SORT_ORDERS.map((value) => (
              <DropdownMenu.RadioItem key={value} className={item} value={value}>
                <ItemCheck />
                <span>{t(`search.sort.${value}`)}</span>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
