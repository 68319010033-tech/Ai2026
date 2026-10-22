export function downloadText(filename, text, { bom = false } = {}) {
  const blob = new Blob([bom ? '\ufeff' + text : text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
