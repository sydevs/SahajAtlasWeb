// Reached only from the registration confirmation, which lives inside the
// lazily-loaded RegistrationView chunk (issue #96). Deliberately NOT re-exported
// from the molecules barrel — that barrel is imported by EAGER views, and the
// re-export edge alone would pull this and its luxon-backed builder into the
// first-load payload of every host page. Same rule the barrel states for
// ShareContent and ImageCarousel. Import it by leaf path.
export { AddToCalendar } from './AddToCalendar'
export type { AddToCalendarProps } from './AddToCalendar'
