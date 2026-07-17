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
      ? 'px-2 sm:px-3 py-1.5 sm:py-2 text-center text-sm sm:text-base font-semibold opacity-60'
      : 'px-2 sm:px-3 py-1.5 sm:py-2 text-center text-xs sm:text-sm font-medium opacity-40'

  return (
    <th className={className} colSpan={colSpan}>
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
  <tr className="block sm:table-row mb-4 sm:mb-0 border-b sm:border-b-0 pb-4 sm:pb-0">
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
    ? 'block sm:table-cell px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold sm:font-medium opacity-60'
    : 'block sm:table-cell px-2 sm:px-3 py-1.5 sm:py-2 text-start sm:text-center'

  return (
    <td className={className}>
      <div className="sm:flex sm:justify-center">{children}</div>
    </td>
  )
}
