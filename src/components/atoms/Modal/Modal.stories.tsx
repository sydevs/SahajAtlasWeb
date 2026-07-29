import type { Story, StoryDefault } from '@ladle/react'

import { useState } from 'react'

import { StoryWrapper, StorySection } from '../../ladle'

import { Modal, ModalBody, ModalClose, ModalContent, ModalFooter } from './Modal'

import { Button } from '@/components/atoms/Button'

export default {
  title: 'Atoms',
} satisfies StoryDefault

/**
 * Modal — a centred, ephemeral dialog on @radix-ui/react-dialog. Radix owns the focus
 * trap, Esc and scroll lock; the skin reuses the Drawer atom's tokens. It portals into
 * the themed widget root (`overlayContainer()`), so an embedded modal keeps the brand
 * palette — switch the palette control to see it follow.
 *
 * Unlike the Drawer it is NOT part of the URL-driven drawer stack: nothing about it
 * touches the URL or history. Reach for the Drawer for anything that is a place.
 */
export const Default: Story = () => {
  const [open, setOpen] = useState(false)
  const [plain, setPlain] = useState(false)

  return (
    <StoryWrapper>
      <StorySection
        description="Title, description, an × control, a scrollable body and a footer action row. Esc, the backdrop and × all close it."
        title="With a description"
      >
        <div className="flex h-48 items-center justify-center">
          <Button color="primary" onClick={() => setOpen(true)}>
            Open modal
          </Button>
        </div>

        <Modal open={open} onOpenChange={setOpen}>
          <ModalContent
            closeLabel="Close"
            description="Everything below the header is the caller's own content."
            title="Modal title"
          >
            <ModalBody>
              <p className="py-2 text-sm">
                The body scrolls when it outgrows the panel, which is capped at the viewport height
                less a gutter — so a long form stays reachable on a short screen.
              </p>
            </ModalBody>
            <ModalFooter>
              <ModalClose>
                <Button variant="flat">Cancel</Button>
              </ModalClose>
              <ModalClose>
                <Button color="primary" variant="flat">
                  Confirm
                </Button>
              </ModalClose>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </StorySection>

      <StorySection
        description="With no `description` the header is just the title and the × — Radix's missing-description warning is opted out of rather than papered over with a hidden element."
        title="Title only"
      >
        <div className="flex h-48 items-center justify-center">
          <Button variant="flat" onClick={() => setPlain(true)}>
            Open modal
          </Button>
        </div>

        <Modal open={plain} onOpenChange={setPlain}>
          <ModalContent closeLabel="Close" title="Are you sure?">
            <ModalFooter>
              <ModalClose>
                <Button variant="flat">No</Button>
              </ModalClose>
              <ModalClose>
                <Button color="primary" variant="flat">
                  Yes
                </Button>
              </ModalClose>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </StorySection>
    </StoryWrapper>
  )
}
