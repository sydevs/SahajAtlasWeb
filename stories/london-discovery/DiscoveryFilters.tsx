import type { ReactNode } from 'react'

import * as Popover from '@radix-ui/react-popover'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'

import { Button } from '@/components/atoms/Button'

export function FilterField({
  label,
  any,
  options,
  value,
  onChange,
}: {
  label: string
  any: string
  options: string[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
      {label}
      <span className="relative">
        <select
          aria-label={label}
          className="h-11 w-full cursor-pointer appearance-none truncate rounded-md border border-gray-6 bg-background ps-3 pe-8 text-base font-normal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{any}</option>
          {options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-gray-11"
          size={16}
        />
      </span>
    </label>
  )
}

export function DiscoveryFilters({
  container,
  active,
  resultLabel,
  onClear,
  children,
}: {
  container: HTMLElement | null
  active: number
  resultLabel: string
  onClear: () => void
  children: ReactNode
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button
          className="h-11 gap-1.5 px-3"
          color="primary"
          variant={active ? 'flat' : 'bordered'}
        >
          <SlidersHorizontal aria-hidden size={17} />
          Filters
          {active > 0 && (
            <span className="rounded-full bg-primary-12 px-1.5 text-xs font-semibold text-white">
              {active}
            </span>
          )}
        </Button>
      </Popover.Trigger>
      <Popover.Portal container={container}>
        <Popover.Content
          align="end"
          aria-label="Filter classes"
          className="z-50 max-h-[var(--radix-popover-content-available-height)] w-[min(336px,calc(100vw-20px))] overflow-y-auto overscroll-contain rounded-xl border border-divider bg-background p-4 text-foreground shadow-lg"
          collisionBoundary={container}
          collisionPadding={10}
          sideOffset={6}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Filters</h2>
            {active > 0 && (
              <Button className="-me-2" color="primary" size="sm" variant="ghost" onClick={onClear}>
                Clear all
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">{children}</div>
          <Popover.Close asChild>
            <Button className="mt-4 h-11 w-full" color="primary">
              Show {resultLabel}
            </Button>
          </Popover.Close>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
