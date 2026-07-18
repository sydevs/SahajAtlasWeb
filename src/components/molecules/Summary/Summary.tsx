import type { ReactNode } from 'react'

export type SummaryItem = {
  /** Icon-set icon leading the line (never emoji). */
  icon: ReactNode
  /** Plain-text fact content — facts are never actions (issue #52 grammar). */
  text: ReactNode
}

export type SummaryProps = {
  items: SummaryItem[]
  className?: string
}

/**
 * A stack of icon + plain-text fact lines (the event panel's when/where block).
 * Purely presentational: nothing here looks like a button or navigates —
 * callers pass already-composed content per line.
 */
export function Summary({ items, className }: SummaryProps) {
  if (items.length === 0) return null

  return (
    <div className={`flex flex-col gap-2.5 ${className ?? ''}`}>
      {items.map((item, index) => (
        <div key={index} className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0 text-primary">{item.icon}</span>
          <div className="min-w-0 text-sm font-medium leading-snug">{item.text}</div>
        </div>
      ))}
    </div>
  )
}
