// QR codes for hosts printing posters. The encoder is imported on demand, so a visitor who never
// opens the QR panel downloads none of it.

/** The modules of a QR code, including its quiet zone. `true` is a dark module. */
export type QrMatrix = boolean[][]

/**
 * Medium error correction survives a scuffed poster without growing the code much. The four-module
 * border is the quiet zone the QR spec asks for, and scanners rely on it.
 */
export async function encodeQr(text: string): Promise<QrMatrix> {
  const { encode } = await import('uqr')

  return encode(text, { ecc: 'M', border: 4 }).data
}

/** The dark modules as one SVG path, in a viewBox of `matrix.length` units. */
export const qrSvgPath = (matrix: QrMatrix): string =>
  matrix.flatMap((row, y) => row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : ''))).join('')

/** Long edge of the downloaded image. Enough for an A4 poster at a generous print size. */
const PNG_TARGET_PX = 1200

/**
 * A black-on-white PNG, at a whole number of pixels per module so every edge stays sharp. Colours
 * are fixed on purpose: scanners need dark on light, whatever the host's brand or theme.
 */
export function qrPngBlob(matrix: QrMatrix): Promise<Blob | null> {
  const scale = Math.max(1, Math.floor(PNG_TARGET_PX / matrix.length))
  const canvas = document.createElement('canvas')

  canvas.width = canvas.height = matrix.length * scale

  const context = canvas.getContext('2d')

  if (!context) return Promise.resolve(null)

  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#000'
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) context.fillRect(x * scale, y * scale, scale, scale)
    }),
  )

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

/** "Evening Meditation at The Hut" → `evening-meditation-at-the-hut-qr.png`. */
export const qrFileName = (title: string): string => {
  const slug = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')

  return `${slug || 'class'}-qr.png`
}
