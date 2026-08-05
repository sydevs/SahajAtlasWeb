import type { SortOrder } from '@/lib/shape'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useTranslation } from 'react-i18next'

import { Button, HEADER_CONTROL } from '@/components/atoms/Button'
import { CheckIcon, DownArrowIcon, SortIcon } from '@/components/atoms/Icons'
import { useSetSortOrder, useSortOrder } from '@/hooks/use-sort'
import { SORT_ORDERS } from '@/lib/shape'
import { overlayContainer } from '@/lib/overlay'

// Dropdown surface + row skins, mirroring the SettingsMenu selectable-menu pattern
// (Radix RadioGroup + ItemIndicator + CheckIcon). Kept local — the two menus don't
// share a base component, only the look.
const menu =
  'z-50 min-w-44 rounded-xl border border-divider bg-background p-1 text-foreground shadow-xl'
const item =
  'flex cursor-pointer select-none items-center gap-2 rounded-lg px-2 py-2 text-sm outline-none data-[highlighted]:bg-primary-3'

// The radio checkmark in a fixed-width slot, so labels line up whether or not the row
// is the current choice.
function ItemCheck() {
  return (
    <span className="flex w-4 shrink-0 justify-center">
      <DropdownMenu.ItemIndicator>
        <CheckIcon className="text-primary" size={16} />
      </DropdownMenu.ItemIndicator>
    </span>
  )
}

export type SortMenuProps = {
  /**
   * Render the trigger as a bare header icon rather than the labelled `Sort: <current>`
   * row. The current ordering then lives only in the open menu's checkmark, so the
   * label moves into `aria-label` — mirrors `FilterButton`'s own `iconOnly`, and wears
   * the same `HEADER_CONTROL` chrome so the header reads as one set of buttons.
   */
  iconOnly?: boolean
}

/**
 * The results-list sort selector: a ghost trigger showing `Sort: <current>` with a
 * caret, opening a radio menu of the orderings (Recommended / Closest / Soonest) with a
 * checkmark on the active one. Reads/writes `?sort=` — presentation only, so picking an
 * order re-sorts the visible list without refetching (see `EventsList`). Built directly
 * on Radix DropdownMenu (RadioGroup + ItemIndicator) rather than the Dropdown/Select
 * atoms, which don't model a checked selection — the same choice SettingsMenu makes.
 */
export function SortMenu({ iconOnly = false }: SortMenuProps = {}) {
  const { t } = useTranslation('common')
  const order = useSortOrder()
  const setOrder = useSetSortOrder()
  const container = overlayContainer()
  const label = `${t('sort.label')}: ${t(`sort.${order}`)}`

  // modal={false}: this menu opens inside the draggable vaul drawer; Radix's default
  // modal scroll-lock + body pointer-events trap fights the sheet's own drag/scroll.
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        {iconOnly ? (
          <Button {...HEADER_CONTROL} aria-label={label}>
            <SortIcon size={20} />
          </Button>
        ) : (
          <Button size="sm" variant="ghost">
            <span>{label}</span>
            <DownArrowIcon size={16} />
          </Button>
        )}
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal container={container}>
        <DropdownMenu.Content align="end" className={menu} sideOffset={8}>
          <DropdownMenu.RadioGroup
            value={order}
            onValueChange={(value) => setOrder(value as SortOrder)}
          >
            {SORT_ORDERS.map((value) => (
              <DropdownMenu.RadioItem key={value} className={item} value={value}>
                <ItemCheck />
                <span>{t(`sort.${value}`)}</span>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
