// Saving a file the widget made in the browser: the calendar file, the poster QR code.

/**
 * A title as an ASCII file-name stem: "Méditation du soir" → `meditation-du-soir`. ASCII-only
 * because the `download` attribute reaches Windows and Android filesystems with very different
 * ideas about what a filename may contain, and a title is SahajCloud free text in any script. A
 * transliteration library would be a dependency for a filename, so a non-Latin title degrades to
 * `fallback`, rather than to mojibake.
 */
export function fileStem(title: string, fallback: string): string {
  const slug = title
    .normalize('NFKD')
    // Strips combining marks, but only AFTER NFKD has split them off their
    // base letter (so "Méditation" slugs to "meditation", not "m-ditation").
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60)

  return slug || fallback
}

/** Hands the visitor `blob` as a download named `fileName`. */
export function saveBlob(blob: Blob, fileName: string) {
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = href
  anchor.download = fileName
  // Firefox only follows a synthetic click on an anchor that is IN the document.
  // Revoking in the same tick cancels the download in Safari, so it is deferred.
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(href), 1000)
}
