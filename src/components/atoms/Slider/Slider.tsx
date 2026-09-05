import * as RadixSlider from '@radix-ui/react-slider'
import { tv } from 'tailwind-variants'

// A range slider on the brand tokens, wrapping @radix-ui/react-slider. The
// number of thumbs follows the `value` or `defaultValue` length, so a
// two-element value renders a two-handle range, as the time-of-day filter
// uses. It can be controlled or uncontrolled. The track fill uses the
// primary ramp.
const slider = tv({
  slots: {
    root: 'relative flex w-full touch-none select-none items-center data-[disabled]:opacity-disabled',
    track: 'relative h-1.5 grow rounded-full bg-gray-6',
    range: 'absolute h-full rounded-full bg-primary-9',
    thumb:
      'block h-4 w-4 rounded-full border border-gray-7 bg-gray-1 shadow outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus',
  },
  variants: {
    // Active-filter tint. This colours the UNFILLED track and thumb border
    // primary. The filled range keeps its solid primary. This makes an
    // in-use field stand out, changing colour only, with no wrapper and no
    // padding, so the layout never shifts.
    highlight: {
      true: { track: 'bg-primary-5', thumb: 'border-primary-7' },
    },
    // Validation error: this recolours to danger. The unfilled track and
    // thumb border, and the filled range, all swap their primary for
    // danger. This changes colour only. The root also sets `aria-invalid`.
    // This exists for interface parity with the other input atoms. A slider
    // always holds an in-range value, so it rarely errors in practice.
    isInvalid: {
      true: { track: 'bg-danger-6', range: 'bg-danger-9', thumb: 'border-danger-7' },
    },
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
  /** Accessible label per thumb. A single string labels every thumb. This is not a
   *  DOM `aria-label`. It fans out to each thumb, so every thumb keeps a distinct name. */
  thumbLabels?: string | string[]
  /** Primary-tint the slider to flag an active field. */
  highlight?: boolean
  /** Danger-tint the slider and set `aria-invalid` to flag a validation error. */
  isInvalid?: boolean
  /** Id of the field's error or description text. It is forwarded for screen readers. */
  'aria-describedby'?: string
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
  thumbLabels,
  highlight,
  isInvalid,
  'aria-describedby': describedBy,
  className,
}: SliderProps) {
  const { root, track, range, thumb } = slider({ highlight, isInvalid })
  // One thumb per value entry. This falls back to a single thumb at the minimum.
  const thumbs = value ?? defaultValue ?? [min]
  const labelFor = (index: number) =>
    Array.isArray(thumbLabels) ? thumbLabels[index] : thumbLabels

  return (
    <RadixSlider.Root
      aria-describedby={describedBy}
      aria-invalid={isInvalid || undefined}
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
        // Thumbs are positional, with a fixed count. So the index is their identity.
        <RadixSlider.Thumb key={index} aria-label={labelFor(index)} className={thumb()} />
      ))}
    </RadixSlider.Root>
  )
}
