// This is reached only from the registration confirmation, which lives
// inside the lazily-loaded RegistrationView chunk (issue #96). It is
// deliberately NOT re-exported from the molecules barrel. That barrel is
// imported by EAGER views, and the re-export edge alone would pull this,
// and its luxon-backed builder, into the first-load payload of every host
// page. The barrel states the same rule for ShareContent and ImageCarousel.
// Import this by leaf path.
export { AddToCalendar } from './AddToCalendar'
export type { AddToCalendarProps } from './AddToCalendar'
