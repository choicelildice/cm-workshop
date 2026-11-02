import { exportAllBoards } from './projects'

/** Saves every project and its board to a JSON file in the browser's downloads. */
export function downloadAllBoards(): void {
  const { filename, json } = exportAllBoards()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // Revoke after the click has been handled; immediate revocation can cancel it
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
