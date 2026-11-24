import type { ReactNode } from 'react'

/**
 * StoryGrid family — consistent table/grid layouts for multi-dimensional
 * component matrices. Ported from WeMeditateWeb for parity (see STORYBOOK.md).
 * Mobile-first: stacks vertically below `sm`, normal table at `sm`+.
 */
export interface StoryGridProps {
  children: ReactNode
}

export const StoryGrid = ({ children }: StoryGridProps) => (
  <div className="overflow-x-auto">
    <table className="min-w-full sm:table">{children}</table>
  </div>
)

/**
 * ⚠ The looser padding on a touch screen is the 44px tap floor, not spacing taste (#432): a
 * matrix packs demo controls tightly enough that their own tap areas overlap, and each cell
 * but the last then answers across less than 44px. These pages are read on a phone like any
 * other, so the grid takes the floor rather than an exemption from the gate.
 *
 * ⚠ The vertical figure leaves the area SLACK in the cell, and 12px — which fits a 20px control's
 * area to the pixel — is why: the gate probes a symmetric cross from the rounded centre, so a row
 * of the page's own sub-pixel offset costs the last probe and an exact fit reports 43px.
 */
const cellPadding = 'px-2 sm:px-3 py-1.5 sm:py-2 pointer-coarse:px-3 pointer-coarse:py-3.5'

export interface StoryGridHeaderProps {
  children: ReactNode
}

export const StoryGridHeader = ({ children }: StoryGridHeaderProps) => (
  <thead className="hidden sm:table-header-group">{children}</thead>
)

export interface StoryGridHeaderRowProps {
  children: ReactNode
}

export const StoryGridHeaderRow = ({ children }: StoryGridHeaderRowProps) => <tr>{children}</tr>

export interface StoryGridHeaderCellProps {
  children?: ReactNode
  colSpan?: number
  /** Size variant for header cells */
  size?: 'primary' | 'secondary'
}

export const StoryGridHeaderCell = ({
  children,
  colSpan,
  size = 'primary',
}: StoryGridHeaderCellProps) => {
  const className =
    size === 'primary'
      ? `${cellPadding} text-center text-sm sm:text-base font-semibold text-gray-11`
      : `${cellPadding} text-center text-xs sm:text-sm font-medium text-gray-11`

  // The corner cell above a column of row labels names nothing, and a header cell with no text
  // is a header a screen reader announces as empty. Plain `<td>` is what a corner is.
  if (children == null) return <td className={className} colSpan={colSpan} />

  return (
    <th className={className} colSpan={colSpan} scope="col">
      {children}
    </th>
  )
}

export interface StoryGridBodyProps {
  children: ReactNode
}

export const StoryGridBody = ({ children }: StoryGridBodyProps) => (
  <tbody className="block sm:table-row-group">{children}</tbody>
)

export interface StoryGridRowProps {
  children: ReactNode
}

export const StoryGridRow = ({ children }: StoryGridRowProps) => (
  <tr className="mb-4 block border-b pb-4 sm:mb-0 sm:table-row sm:border-b-0 sm:pb-0">
    {children}
  </tr>
)

export interface StoryGridCellProps {
  children?: ReactNode
  /** Whether this is a row label cell */
  isLabel?: boolean
}

export const StoryGridCell = ({ children, isLabel = false }: StoryGridCellProps) => {
  const className = isLabel
    ? `block sm:table-cell ${cellPadding} text-xs sm:text-sm font-semibold sm:font-medium text-gray-11`
    : `block sm:table-cell ${cellPadding} text-start sm:text-center`

  return (
    <td className={className}>
      <div className="sm:flex sm:justify-center">{children}</div>
    </td>
  )
}
