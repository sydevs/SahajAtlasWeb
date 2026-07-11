import { type ReactNode } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useTranslation } from 'react-i18next'

import {
  CheckIcon,
  LanguageIcon,
  MonitorIcon,
  MoonFilledIcon,
  RightArrowIcon,
  SettingsIcon,
  SunFilledIcon,
} from '@/components/atoms/Icons'
import { supportedLanguages } from '@/config/i18n'
import { useLocale } from '@/hooks/use-locale'
import { type ThemePreference, useThemePreference } from '@/hooks/use-theme'
import { overlayContainer } from '@/lib/overlay'

const menu =
  'z-50 min-w-[11rem] rounded-xl border border-divider bg-background p-1 text-foreground shadow-xl'
const item =
  'flex cursor-pointer select-none items-center gap-2 rounded-lg px-2 py-2 text-sm outline-none data-[highlighted]:bg-primary-3 data-[state=open]:bg-primary-3'

// The radio-selected checkmark, in a fixed-width slot so labels line up whether or
// not the row is the current choice.
function ItemCheck() {
  return (
    <span className="flex w-4 shrink-0 justify-center">
      <DropdownMenu.ItemIndicator>
        <CheckIcon className="text-primary" size={16} />
      </DropdownMenu.ItemIndicator>
    </span>
  )
}

// A floating cog that opens a settings dropdown: language + colour mode, each a row
// showing the current choice (icon + label) that opens a submenu to change it. Built
// on Radix DropdownMenu (Sub / RadioGroup) — one clean menu with submenu flow —
// replacing the old footer's LanguageSelector + ThemeSwitch. `className` positions
// the trigger button.
export function SettingsMenu({
  className,
  side = 'bottom',
}: {
  className?: string
  /** Which side the menu opens toward the trigger (bottom for a top cog, top for a bottom cog). */
  side?: DropdownMenu.DropdownMenuContentProps['side']
}) {
  const { t } = useTranslation('common')
  const { locale, setLocale, languageNames } = useLocale()
  const { preference, setPreference } = useThemePreference()
  const container = overlayContainer()

  const themes: { value: ThemePreference; label: string; icon: ReactNode }[] = [
    { value: 'light', label: t('theme.light'), icon: <SunFilledIcon size={18} /> },
    { value: 'dark', label: t('theme.dark'), icon: <MoonFilledIcon size={18} /> },
    { value: 'auto', label: t('theme.auto'), icon: <MonitorIcon size={18} /> },
  ]
  const currentTheme = themes.find((th) => th.value === preference) ?? themes[0]

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label={t('settings')}
          className={`flex h-10 w-10 items-center justify-center rounded-full border border-divider bg-background text-gray-11 shadow-lg transition-colors hover:text-foreground ${className ?? ''}`}
          type="button"
        >
          <SettingsIcon size={20} />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal container={container}>
        <DropdownMenu.Content align="start" className={menu} side={side} sideOffset={8}>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className={item}>
              <LanguageIcon size={18} />
              <span className="flex-1 capitalize">{languageNames.of(locale)}</span>
              <RightArrowIcon className="text-gray-11" />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal container={container}>
              <DropdownMenu.SubContent className={menu} sideOffset={4}>
                <DropdownMenu.RadioGroup value={locale} onValueChange={setLocale}>
                  {supportedLanguages.map((lng) => (
                    <DropdownMenu.RadioItem key={lng} className={item} value={lng}>
                      <ItemCheck />
                      <span className="capitalize">{languageNames.of(lng)}</span>
                    </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.RadioGroup>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>

          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className={item}>
              {currentTheme.icon}
              <span className="flex-1">{currentTheme.label}</span>
              <RightArrowIcon className="text-gray-11" />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal container={container}>
              <DropdownMenu.SubContent className={menu} sideOffset={4}>
                <DropdownMenu.RadioGroup
                  value={preference}
                  onValueChange={(v) => setPreference(v as ThemePreference)}
                >
                  {themes.map((th) => (
                    <DropdownMenu.RadioItem key={th.value} className={item} value={th.value}>
                      <ItemCheck />
                      {th.icon}
                      <span>{th.label}</span>
                    </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.RadioGroup>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
