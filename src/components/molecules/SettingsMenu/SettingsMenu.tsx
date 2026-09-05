import { type ReactNode } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useTranslation } from 'react-i18next'
import { Check, ChevronRight, Info, Languages, Monitor, Moon, Settings, Sun } from 'lucide-react'

import { frameCollision } from '@/lib/overlay'
import { supportedLanguages } from '@/config/i18n-options'
import { useWidgetMode } from '@/config/mode'
import { useReportModal } from '@/config/store'
import { nativeLanguageLabel, useLocale } from '@/hooks/use-locale'
import { type ThemePreference, useThemePreference } from '@/hooks/use-theme'
import { overlayContainer } from '@/lib/overlay'
import { publishLocale } from '@/lib/shape'

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

// A floating cog that opens a settings dropdown: language and colour
// mode, each a row showing the current choice, icon and label, that
// opens a submenu to change it. This is built on Radix DropdownMenu (Sub
// and RadioGroup), one clean menu with submenu flow, replacing the old
// footer's LanguageSelector and ThemeSwitch. `className` positions the
// trigger button.
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
  const { linkable } = useWidgetMode()
  const openReport = useReportModal((state) => state.openReport)
  const container = overlayContainer()

  // This publishes the pick to the page URL, as well as changing the
  // language. So the address bar describes what the visitor is looking
  // at. The link they copy, and a reload, both keep it. `?locale=` was
  // already read at boot (`config/i18n-options.ts`) and documented to
  // integrators. This is the write side that never existed.
  //
  // ⚠ This lives here, not inside `useLocale().setLocale`. This is the
  // only place a viewer picks a language, while `useLocale` is called by
  // every card in a list that pages to hundreds of rows. Putting a
  // context read and a URL write on that hook would put both on the
  // app's hottest path, to serve one menu.
  //
  // This is skipped in memory routing, where the widget's route
  // deliberately is not in a URL at all. `linkable` is that question,
  // already decided once at mount.
  const chooseLocale = (next: string) => {
    setLocale(next)
    if (linkable) publishLocale(next)
  }

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
              {/* The same endonym the list below shows. It was already one
                  by construction: a DisplayNames built in `locale`, naming
                  `locale`. This states it outright, so the row and its list
                  cannot drift apart. */}
              <span className="flex-1 capitalize" lang={locale}>
                {nativeLanguageLabel(locale)}
              </span>
              <ChevronRight className="text-gray-11 rtl:-scale-x-100" size={18} />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal container={container}>
              <DropdownMenu.SubContent className={menu} sideOffset={4} {...frameCollision()}>
                {/* Each row reads in ITS OWN language, not the one currently
                    on screen. A menu whose whole purpose is to be used by
                    someone who cannot read the current language must not
                    label English as "anglais". This uses `capitalize`,
                    because Intl returns lowercase endonyms (español,
                    français, русский). It applies per word, so "português
                    (Brasil)" survives it intact. */}
                <DropdownMenu.RadioGroup value={locale} onValueChange={chooseLocale}>
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

          {/* This is a plain row, not a submenu. It hands off to the report
              modal, which is ephemeral state, not a setting to pick from a
              list (issue #79). */}
          <DropdownMenu.Item className={item} onSelect={() => openReport()}>
            <Info size={18} />
            <span>{t('report.title')}</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
