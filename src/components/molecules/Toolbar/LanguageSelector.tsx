import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'

import { Dropdown, DropdownItem } from '@/components/atoms/Dropdown'
import { LanguageIcon } from '@/components/atoms/Icons'
import { supportedLanguages } from '@/config/i18n'
import { useLocale } from '@/hooks/use-locale'

export function LanguageSelector() {
  const { locale, setLocale, languageNames } = useLocale()
  const { t } = useTranslation('common')
  const [isOpen, setIsOpen] = useState(false)

  const select = (language: string) => {
    setLocale(language)
    setIsOpen(false)
  }

  return (
    <Dropdown
      align="end"
      ariaLabel={t('language_selector')}
      isOpen={isOpen}
      size="sm"
      trigger={
        <div className="font-semibold text-md text-gray-11 uppercase flex flex-row gap-1 items-center hover:opacity-hover">
          <LanguageIcon />
          {locale}
        </div>
      }
      onOpenChange={setIsOpen}
    >
      {supportedLanguages.map((language) => (
        <DropdownItem
          key={language}
          className={clsx('capitalize', locale === language && 'text-primary')}
          onClick={() => select(language)}
        >
          {languageNames.of(language)}
        </DropdownItem>
      ))}
    </Dropdown>
  )
}
