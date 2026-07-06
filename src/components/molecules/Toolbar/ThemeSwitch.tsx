import { FC, useState, useEffect } from 'react'
import clsx from 'clsx'

import { useTheme } from '@/hooks/use-theme'
import { SunFilledIcon, MoonFilledIcon } from '@/components/atoms/Icons'

export interface ThemeSwitchProps {
  className?: string
}

// A light/dark toggle. Visually it's an icon button (moon in light mode → switch
// to dark, sun in dark mode → switch to light), so it's a plain accessible
// <button> rather than a switch track — no NextUI useSwitch needed.
export const ThemeSwitch: FC<ThemeSwitchProps> = ({ className }) => {
  const [isMounted, setIsMounted] = useState(false)

  const { isLight, toggleTheme } = useTheme()

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Prevent hydration mismatch (SSR/static markup has no theme yet).
  if (!isMounted) return <div className="w-6 h-6" />

  return (
    <button
      aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      className={clsx(
        'flex items-center justify-center px-px text-gray-11 cursor-pointer transition-opacity hover:opacity-hover',
        className,
      )}
      type="button"
      onClick={toggleTheme}
    >
      {isLight ? <MoonFilledIcon size={22} /> : <SunFilledIcon size={22} />}
    </button>
  )
}
