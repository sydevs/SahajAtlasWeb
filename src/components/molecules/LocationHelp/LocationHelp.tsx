import { useTranslation } from 'react-i18next'

import { Button } from '@/components/atoms/Button'
import {
  Modal,
  ModalBody,
  ModalClose,
  ModalContent,
  ModalFooter,
  type ModalContentProps,
} from '@/components/atoms/Modal'

export type LocationProblem = 'blocked' | 'failed'

/** Which way into the browser's location setting to describe. */
const devicePlatform = (): 'ios' | 'android' | 'other' => {
  const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent

  if (/iPhone|iPad|iPod/.test(agent)) return 'ios'
  if (/Android/.test(agent)) return 'android'

  return 'other'
}

export type LocationHelpProps = {
  /** What went wrong, or `null` when there's nothing to say. */
  problem: LocationProblem | null
  onClose: () => void
  /** Offers the town search instead. Omitted where no search is on screen. */
  onSearchInstead?: () => void
  onCloseAutoFocus?: ModalContentProps['onCloseAutoFocus']
}

/**
 * Why a location request didn't work, and what to do about it. Once a visitor has said no, the
 * browser won't ask again, and pressing the button does nothing. So "blocked" says how to turn
 * location back on, where they can act on it, rather than only suggesting a search.
 */
export function LocationHelp({
  problem,
  onClose,
  onSearchInstead,
  onCloseAutoFocus,
}: LocationHelpProps) {
  const { t } = useTranslation()
  const blocked = problem === 'blocked'
  const platform = devicePlatform()

  return (
    <Modal open={problem !== null} onOpenChange={(open) => !open && onClose()}>
      <ModalContent
        closeLabel={t('common.chrome.close')}
        description={blocked ? t('location.blocked_intro') : t('location.failed_body')}
        title={blocked ? t('location.blocked_title') : t('common.map.location_not_available')}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {blocked && (
          <ModalBody>
            <p className="text-base text-foreground">
              {platform === 'ios' && t('location.steps_ios')}
              {platform === 'android' && t('location.steps_android')}
              {platform === 'other' && t('location.steps_desktop')}
            </p>
          </ModalBody>
        )}
        <ModalFooter>
          {onSearchInstead && (
            <Button color="primary" onClick={onSearchInstead}>
              {t('location.search_instead')}
            </Button>
          )}
          <ModalClose>
            <Button color={onSearchInstead ? 'neutral' : 'primary'} variant="flat">
              {t('common.chrome.close')}
            </Button>
          </ModalClose>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
