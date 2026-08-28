import { type ReactNode } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useTranslation } from 'react-i18next'
import { Check, ChevronRight, Info, Languages, Monitor, Moon, Settings, Sun } from 'lucide-react'

import { frameCollision } from '@/lib/overlay'
import { supportedLanguages } from '@/config/i18n-options'
import { useReportModal } from '@/config/store'
import { nativeLanguageLabel, useLocale } from '@/hooks/use-locale'
import { type ThemePreference, useThemePreference } from '@/hooks/use-theme'
import { overlayContainer } from '@/lib/overlay'

const menu =
  'z-50 min-w-44 rounded-xl border border-divider bg-background p-1 text-foreground shadow-xl'
const item =
  'flex cursor-pointer select-none items-center gap-2 rounded-lg px-2 py-2 text-sm outline-none data-[highlighted]:bg-primary-3 data-[state=open]:bg-primary-3'

// The radio-selected checkmark, in a fixed-width slot so labels line up whether or
// not the row is the current choice.
function ItemCheck() {
  return (
    <span className="flex w-4 shrink-0 justify-center">
      <DropdownMenu.ItemIndicator>
        <Check className="text-primary" size={16} />
      </DropdownMenu.ItemIndicator>
    </span>
  )
}

// A floating cog that opens a settings dropdown: language + colour mode, each a row
// showing the current choice (icon + label) that opens a submenu to change it. Built
// on Radix DropdownMenu (Sub / RadioGroup) — one clean menu with submenu flow —
// replacing the old footer's LanguageSelector + ThemeSwitch. `className` positions
// the trigger button.
export type SettingsMenuProps = {
  /** Positions the trigger button (the cog floats over the map or the panel). */
  className?: string
  /** Which side the menu opens toward the trigger (bottom for a top cog, top for a bottom cog). */
  side?: DropdownMenu.DropdownMenuContentProps['side']
}

export function SettingsMenu({ className, side = 'bottom' }: SettingsMenuProps) {
  const { t } = useTranslation('common')
  const { locale, setLocale } = useLocale()
  const { preference, setPreference } = useThemePreference()
  const openReport = useReportModal((state) => state.openReport)
  const container = overlayContainer()

  const themes: { value: ThemePreference; label: string; icon: ReactNode }[] = [
    { value: 'light', label: t('theme.light'), icon: <Sun size={18} /> },
    { value: 'dark', label: t('theme.dark'), icon: <Moon size={18} /> },
    { value: 'auto', label: t('theme.auto'), icon: <Monitor size={18} /> },
  ]
  const currentTheme = themes.find((th) => th.value === preference) ?? themes[0]

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label={t('settings')}
          className={`flex h-8 w-8 items-center justify-center rounded-full border border-divider bg-background text-gray-11 shadow-lg transition-colors hover:text-foreground ${className ?? ''}`}
          type="button"
        >
          <Settings size={16} />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal container={container}>
        <DropdownMenu.Content
          align="start"
          className={menu}
          side={side}
          sideOffset={8}
          {...frameCollision()}
        >
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className={item}>
              <Languages size={18} />
              {/* The same endonym the list below shows. It was already one by construction (a
                  DisplayNames built in `locale`, naming `locale`) — said outright so the row and
                  its list cannot drift apart. */}
              <span className="flex-1 capitalize" lang={locale}>
                {nativeLanguageLabel(locale)}
              </span>
              <ChevronRight className="text-gray-11 rtl:-scale-x-100" size={18} />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal container={container}>
              <DropdownMenu.SubContent className={menu} sideOffset={4} {...frameCollision()}>
                {/* Each row reads in ITS OWN language, not the one currently on screen. A menu
                    whose whole purpose is to be used by someone who cannot read the current
                    language must not label English as "anglais". `capitalize` because Intl
                    returns lowercase endonyms (español, français, русский); it is per-word, so
                    "português (Brasil)" survives it intact. */}
                <DropdownMenu.RadioGroup value={locale} onValueChange={setLocale}>
                  {supportedLanguages.map((lng) => (
                    <DropdownMenu.RadioItem key={lng} className={item} lang={lng} value={lng}>
                      <ItemCheck />
                      <span className="capitalize">{nativeLanguageLabel(lng)}</span>
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
              <ChevronRight className="text-gray-11 rtl:-scale-x-100" size={18} />
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

          <DropdownMenu.Separator className="my-1 h-px bg-divider" />

          {/* A plain row rather than a submenu: it hands off to the report modal, which
              is ephemeral state, not a setting to pick from a list (issue #79). */}
          <DropdownMenu.Item className={item} onSelect={() => openReport()}>
            <Info size={18} />
            <span>{t('report.title')}</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
