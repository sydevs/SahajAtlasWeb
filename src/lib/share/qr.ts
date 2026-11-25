// QR codes for hosts printing posters. The encoder is imported on demand, so a visitor who never
// opens the QR row downloads none of it.
import { fileStem } from '../download'

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

/**
 * Pixels per module, as a whole number so every edge prints sharp. The 1200 px long edge is
 * enough for an A4 poster at a generous print size.
 */
export const qrPngScale = (matrix: QrMatrix): number =>
  Math.max(1, Math.floor(1200 / matrix.length))

/**
 * A black-on-white PNG. The colours are fixed on purpose: scanners need dark on light, whatever
 * the host's brand or theme.
 */
export function qrPngBlob(matrix: QrMatrix): Promise<Blob | null> {
  const scale = qrPngScale(matrix)
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
export const qrFileName = (title: string): string => `${fileStem(title, 'class')}-qr.png`
