/**
 * Shrinks a photo in the browser before it is sent. A phone photo is 3–8 MB;
 * the server resizes it anyway, and a smaller upload is the difference between
 * saving and timing out on campus data.
 */
export async function toCompressedDataUrl(file: File, maxSide = 1200): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('That image could not be read.'))
      el.src = url
    })
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('This browser cannot prepare images.')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.85)
  } finally {
    URL.revokeObjectURL(url)
  }
}
