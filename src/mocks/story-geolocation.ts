/**
 * A browser that refuses the visitor's location, for the stories that show what Near me says then.
 * Returns the undo. Stories only: the widget never replaces `navigator.geolocation`.
 */
export const refuseGeolocation = (): (() => void) => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'geolocation')
  const refusing: Pick<Geolocation, 'getCurrentPosition'> = {
    getCurrentPosition: (_resolve, reject) =>
      reject?.({ code: 1, message: 'User denied Geolocation' } as GeolocationPositionError),
  }

  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: refusing })

  return () => {
    if (original) Object.defineProperty(navigator, 'geolocation', original)
    else Reflect.deleteProperty(navigator, 'geolocation')
  }
}
