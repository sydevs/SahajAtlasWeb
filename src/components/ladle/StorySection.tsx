import type { ReactNode } from 'react'

/**
 * Unified StorySection component for consistent story structure in Ladle.
 * Ported from WeMeditateWeb for parity — see STORYBOOK.md.
 *
 * Chrome uses the semantic tokens so it stays legible in both themes; the
 * canvas theme is driven by Ladle's own toggle (see .ladle/components.tsx).
 *
 * @param title - Section title (renders as h2 for sections, p for subsections)
 * @param description - Optional description text below the title
 * @param children - The section content
 * @param background - Context background simulating the map surface panels float
 *   over: 'none', 'neutral' (semantic surface), or 'gradient' (brand teal)
 * @param variant - Section type: 'section', 'subsection', or 'scrollable'
 * @param inContext - When true, adds "In Context" prefix to title and bold top border
 */
export interface StorySectionProps {
  title: string
  description?: string
  children: ReactNode
  background?: 'none' | 'neutral' | 'gradient'
  variant?: 'section' | 'subsection' | 'scrollable'
  inContext?: boolean
}

export const StorySection = ({
  title,
  description,
  children,
  background = 'none',
  variant = 'section',
  inContext = false,
}: StorySectionProps) => {
  // Context backgrounds that simulate the map surface panels float over. The
  // teal gradient is a fixed dark brand colour, so its text is pinned white to
  // read in both themes; neutral uses a theme-aware semantic surface token.
  const getBackgroundStyles = () => {
    if (background === 'neutral') return 'bg-gray-3 p-6 rounded-lg'
    if (background === 'gradient')
      return 'bg-gradient-to-b from-teal-600 to-teal-700 p-6 rounded-lg text-white'

    return ''
  }

  const titleColor = variant === 'subsection' ? 'text-gray-11' : 'text-foreground'

  const variantConfig = {
    section: {
      tag: 'h2' as const,
      titleClass: 'text-lg font-semibold mb-4',
      showDivider: true,
      wrapperClass: '',
      isScrollable: false,
    },
    subsection: {
      tag: 'p' as const,
      titleClass: 'text-sm font-medium mb-3',
      showDivider: false,
      wrapperClass: 'mt-5',
      isScrollable: false,
    },
    scrollable: {
      tag: 'h2' as const,
      titleClass: 'text-lg font-semibold mb-4',
      showDivider: true,
      wrapperClass: '',
      isScrollable: true,
    },
  }

  const config = variantConfig[variant]
  const TitleTag = config.tag
  const backgroundStyles = getBackgroundStyles()

  const displayTitle =
    inContext && title ? `In Context - ${title}` : inContext ? 'In Context' : title

  const renderContent = () => {
    if (config.isScrollable) {
      const scrollBackground = backgroundStyles || 'bg-background'

      return (
        <div className="h-[600px] overflow-y-auto border-4 border-gray-6 -m-6">
          <div className={`min-h-full px-6 ${scrollBackground}`}>{children}</div>
        </div>
      )
    }

    if (backgroundStyles) {
      return <div className={backgroundStyles}>{children}</div>
    }

    return <>{children}</>
  }

  return (
    <>
      <div className={config.wrapperClass}>
        {inContext && <div className="border-t-4 border-foreground mb-6 pt-8" />}
        <TitleTag className={`${config.titleClass} ${titleColor}`}>{displayTitle}</TitleTag>
        {description && <p className="text-sm text-gray-11 mb-4">{description}</p>}
        {renderContent()}
      </div>
      {config.showDivider && <hr className="border-divider" />}
    </>
  )
}
