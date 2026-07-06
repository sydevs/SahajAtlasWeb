import { type ComponentProps } from 'react'

import { ThemeSwitch } from './ThemeSwitch'
import { LanguageSelector } from './LanguageSelector'

import { Link } from '@/components/atoms/Link'
import { Logo } from '@/components/atoms/Icons'

// The drawer footer bar. A small Sahaj Atlas wordmark/attribution on the left,
// language + theme controls on the right; rendered in every drawer's DrawerFooter
// slot. Replaces the old Navbar — no nav links, no bordered variant.
export type ToolbarProps = ComponentProps<'div'>

export function Toolbar({ className, ...props }: ToolbarProps) {
  return (
    <div
      className={`flex items-center justify-between gap-2 px-4 py-2 ${className ?? ''}`}
      {...props}
    >
      <Link
        className="flex items-center gap-1 opacity-70 transition-opacity hover:opacity-100"
        color="foreground"
        href="/"
      >
        <Logo />
        <span className="text-xs font-semibold tracking-wide">Sahaj Atlas</span>
      </Link>

      <div className="flex items-center gap-1">
        <LanguageSelector />
        <ThemeSwitch />
      </div>
    </div>
  )
}
