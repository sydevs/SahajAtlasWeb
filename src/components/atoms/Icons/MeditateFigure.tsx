import type { SVGProps } from 'react'

// The We Meditate app's meditating figure, a brand mark Lucide does not have. The path is
// unchanged from `wemeditate-design-system/assets/icons/meditate.svg` (b7c717b). Its clip-path is
// dropped: it clipped nothing, and its `id="a"` would collide between two inline copies.
const PATH =
  'M11.767 19.27s-4.994 1.92-7.256 1.76c-2.653-.16-2.263-2.24-1.17-2.88 1.716-1.038 5.617-2.877 5.617-2.877m2.887 3.997s4.993 1.92 7.255 1.76c2.653-.16 2.263-2.24 1.17-2.88-1.716-1.038-5.617-2.877-5.617-2.877m-5.617-4.158v3.918m5.618-3.918v3.918M1 15.912s3.277-1.759 3.901-2.238 3.12-5.357 3.433-5.517c.39-.16 1.872-.48 1.95-.48m12.483 8.235s-3.589-1.759-4.213-2.238-3.12-5.357-3.433-5.517c-.39-.16-1.56-.4-1.638-.4m-1.638-1.999c1.292 0 2.34-1.074 2.34-2.398s-1.048-2.4-2.34-2.4c-1.293 0-2.34 1.074-2.34 2.399s1.047 2.398 2.34 2.398'

export type MeditateFigureProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  /** Edge length in px, as on a lucide glyph. */
  size?: number
}

export function MeditateFigure({ size = 24, ...props }: MeditateFigureProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {/* The mark's one coral lives here, not at the call site: `currentColor` resolves against
          this element's own colour, and no caller's spread can reach it. */}
      <path className="text-contrast-10 dark:text-contrast" d={PATH} />
    </svg>
  )
}
