// This is reached only from the registration confirmation, which lives
// inside the lazily-loaded RegistrationView chunk (issue #96). It is
// deliberately NOT re-exported from the molecules barrel. The interface's
// views import that barrel, and the re-export edge alone would pull this,
// and its luxon-backed builder, into the download every opened interface
// waits for. The barrel states the same rule for ShareContent.
// Import this by leaf path.
export { AddToCalendar } from './AddToCalendar'
export type { AddToCalendarProps } from './AddToCalendar'
