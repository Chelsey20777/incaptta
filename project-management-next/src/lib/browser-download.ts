export type GeneratedDownload = {
  blob: Blob
  filename: string
}

/** Dispatch a browser download after the caller has finished any access checks. */
export function downloadBlob({ blob, filename }: GeneratedDownload): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    throw new Error('Downloads are only available in a browser.')
  }

  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }

  // Keep the object URL alive long enough for the browser to start reading it.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
