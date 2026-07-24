import { useEffect, useMemo, useRef, useState } from 'react'
import { FloatingFocusManager, FloatingPortal } from '@floating-ui/react'

import { fieldChrome } from '@/components/atoms/Select'
import { DownArrowIcon } from '@/components/atoms/Icons'
import { usePopover } from '@/hooks/use-popover'
import { overlayContainer } from '@/lib/overlay'

/** One option in a {@link SearchableSelect}. */
export type SearchableSelectOption = {
  value: string
  label: string
  /** A muted secondary line (level / breadcrumb) to disambiguate same-named options. */
  hint?: string
}

export type SearchableSelectProps = {
  /** The selected option's value, or `null` for no selection. */
  value: string | null
  /** Called with the next value (or `null` when the current selection is toggled off). */
  onChange: (value: string | null) => void
  options: SearchableSelectOption[]
  /** Trigger label shown when nothing is selected. */
  placeholder?: string
  /** Accessible name for the trigger and the popover. */
  'aria-label'?: string
  /** Placeholder + accessible label for the filter input. */
  searchPlaceholder?: string
  /** Shown when the query matches no options. */
  emptyLabel?: string
  disabled?: boolean
  className?: string
}

/**
 * A searchable single-select combobox: a field-styled trigger that opens a filter
 * input over a scrollable option list. The app's Select atom is a Radix `<select>`
 * (no typeahead) and the language filter is a Dropdown of checkboxes — neither is a
 * type-to-filter single picker, which the (potentially long) region list needs.
 *
 * Built on the shared `usePopover` floating-ui shell (so it flips/shifts and portals
 * out of the map's transform/overflow context) rather than a new dependency. The
 * popover is a `dialog` holding the input + option buttons — the same accessible
 * shape as the language multi-select — with focus moved to the input on open and
 * returned to the trigger on close. Options are toggle buttons: selecting the current
 * one clears it (`null`). Fully controlled.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  'aria-label': ariaLabel,
  searchPlaceholder,
  emptyLabel,
  disabled,
  className,
}: SearchableSelectProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const { isOpen, setIsOpen, refs, floatingStyles, context, getReferenceProps, getFloatingProps } =
    usePopover({ placement: 'bottom-start', role: 'dialog', matchTriggerWidth: true })

  const selected = options.find((option) => option.value === value) ?? null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()

    if (!q) return options

    return options.filter(
      (option) => option.label.toLowerCase().includes(q) || option.hint?.toLowerCase().includes(q),
    )
  }, [options, query])

  // Clear the query whenever the panel closes, so it reopens fresh.
  useEffect(() => {
    if (!isOpen) setQuery('')
  }, [isOpen])

  const select = (next: string | null) => {
    onChange(next)
    setIsOpen(false)
  }

  return (
    <>
      <button
        ref={refs.setReference}
        disabled={disabled}
        type="button"
        {...getReferenceProps()}
        aria-label={ariaLabel}
        className={fieldChrome({ trigger: true, className })}
      >
        <span className={`truncate ${selected ? '' : 'text-gray-11'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <DownArrowIcon className="h-4 w-4 shrink-0 opacity-70" />
      </button>

      {isOpen && (
        <FloatingPortal root={overlayContainer()}>
          <FloatingFocusManager context={context} initialFocus={inputRef} modal={false} returnFocus>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              {...getFloatingProps({ 'aria-label': ariaLabel })}
              className="z-50 flex flex-col overflow-hidden rounded-lg border border-gray-6 bg-background shadow-xl"
            >
              <div className="border-b border-gray-4 p-2">
                <input
                  ref={inputRef}
                  aria-label={searchPlaceholder}
                  className={fieldChrome({ className: 'h-9 px-2' })}
                  placeholder={searchPlaceholder}
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    // Enter selects the top match — a keyboard shortcut past tabbing
                    // into the list.
                    if (event.key === 'Enter' && filtered[0]) {
                      event.preventDefault()
                      select(filtered[0].value)
                    }
                  }}
                />
              </div>
              <ul className="max-h-60 overflow-y-auto p-1">
                {filtered.length === 0 ? (
                  <li className="px-2 py-3 text-center text-sm text-gray-11">{emptyLabel}</li>
                ) : (
                  filtered.map((option) => {
                    const isSelected = option.value === value

                    return (
                      <li key={option.value}>
                        <button
                          aria-pressed={isSelected}
                          className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-sm hover:bg-gray-3 ${
                            isSelected ? 'bg-primary-4 font-semibold' : ''
                          }`}
                          type="button"
                          onClick={() => select(isSelected ? null : option.value)}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-foreground">{option.label}</span>
                            {option.hint && (
                              <span className="block truncate text-xs text-gray-11">
                                {option.hint}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    )
                  })
                )}
              </ul>
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  )
}
