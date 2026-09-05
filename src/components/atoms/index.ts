// Atoms: the smallest building blocks. They render from props alone.
// This is the public import surface: `import { Chip } from
// '@/components/atoms'`. See DESIGN_SYSTEM.md. Components inside
// src/components import each other by direct path, such as
// '@/components/atoms/Chip', not through this barrel. This avoids import
// cycles.
//
// This barrel uses explicit named exports only, never `export *`. So each
// folder's public surface is its primary component or components, plus its
// `Props` type. `Icons/` is the one icon-set module that keeps a wildcard
// re-export. See DESIGN_SYSTEM.md.
export * from './Icons'

export { Alert } from './Alert'
export type { AlertProps } from './Alert'

export { Button, controlSurface } from './Button'
export type { ButtonProps } from './Button'

export { Checkbox } from './Checkbox'
export type { CheckboxProps } from './Checkbox'

export { Chip } from './Chip'
export type { ChipProps } from './Chip'

export { Combobox } from './Combobox'
export type { ComboboxProps, ComboboxOption } from './Combobox'

export {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  DrawerClose,
} from './Drawer'
export type { DrawerProps, DrawerContentProps, DrawerDirection } from './Drawer'

export { Dropdown } from './Dropdown'
export type { DropdownProps } from './Dropdown'

export { Input } from './Input'
export type { InputProps } from './Input'

export { Link } from './Link'
export type { LinkProps } from './Link'

export { Modal, ModalContent, ModalBody, ModalFooter, ModalClose } from './Modal'
export type { ModalProps, ModalContentProps } from './Modal'

export { RadioGroup } from './RadioGroup'
export type { RadioGroupProps, RadioOption } from './RadioGroup'

export { Select, SelectItem } from './Select'
export type { SelectProps, SelectItemProps } from './Select'

export { Slider } from './Slider'
export type { SliderProps } from './Slider'

export { Spinner } from './Spinner'
export type { SpinnerProps } from './Spinner'

export { Textarea } from './Textarea'
export type { TextareaProps } from './Textarea'

export { ToggleGroup, ToggleGroupItem } from './ToggleGroup'
export type { ToggleGroupProps, ToggleGroupItemProps } from './ToggleGroup'
