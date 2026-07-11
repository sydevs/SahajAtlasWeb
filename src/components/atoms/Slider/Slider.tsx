import * as RadixSlider from '@radix-ui/react-slider'
import { tv } from 'tailwind-variants'

// A range slider on the brand tokens, wrapping @radix-ui/react-slider. The number
// of thumbs follows the `value`/`defaultValue` length, so a two-element value
// renders a two-handle range (the time-of-day filter's use). Controlled or
// uncontrolled; the track fill uses the primary ramp.
const slider = tv({
  slots: {
    root: 'relative flex w-full touch-none select-none items-center data-[disabled]:opacity-disabled',
    track: 'relative h-1.5 grow rounded-full bg-gray-6',
    range: 'absolute h-full rounded-full bg-primary-9',
    thumb:
      'block h-4 w-4 rounded-full border border-gray-7 bg-white shadow outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus',
  },
})

export type SliderProps = {
  value?: number[]
  defaultValue?: number[]
  onValueChange?: (value: number[]) => void
  onValueCommit?: (value: number[]) => void
  min?: number
  max?: number
  step?: number
  /** Minimum gap (in steps) the two thumbs must keep between them. */
  minStepsBetweenThumbs?: number
  disabled?: boolean
  /** Accessible label per thumb — a single string labels every thumb. */
  ariaLabel?: string | string[]
  className?: string
}

export function Slider({
  value,
  defaultValue,
  onValueChange,
  onValueCommit,
  min = 0,
  max = 100,
  step = 1,
  minStepsBetweenThumbs,
  disabled,
  ariaLabel,
  className,
}: SliderProps) {
  const { root, track, range, thumb } = slider()
  // One thumb per value entry; falls back to a single thumb at the minimum.
  const thumbs = value ?? defaultValue ?? [min]
  const labelFor = (index: number) => (Array.isArray(ariaLabel) ? ariaLabel[index] : ariaLabel)

  return (
    <RadixSlider.Root
      className={root({ className })}
      defaultValue={defaultValue}
      disabled={disabled}
      max={max}
      min={min}
      minStepsBetweenThumbs={minStepsBetweenThumbs}
      step={step}
      value={value}
      onValueChange={onValueChange}
      onValueCommit={onValueCommit}
    >
      <RadixSlider.Track className={track()}>
        <RadixSlider.Range className={range()} />
      </RadixSlider.Track>
      {thumbs.map((_, index) => (
        // Thumbs are positional and fixed in count, so the index is their identity.
        <RadixSlider.Thumb key={index} aria-label={labelFor(index)} className={thumb()} />
      ))}
    </RadixSlider.Root>
  )
}
