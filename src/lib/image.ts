const CLOUD = (import.meta.env.VITE_CLOUDINARY_CLOUD as string | undefined)?.trim() || 'dwshyzftx'
const PRESET = (import.meta.env.VITE_CLOUDINARY_PRESET as string | undefined)?.trim() || 'blorbmart'

/**
 * Uploads a data URL straight to Cloudinary through the unsigned preset the
 * vendor apps use, and returns its HTTPS URL. Use it where the backend only
 * stores a URL (event covers); market photos and flyers still go through the
 * backend, which crops and resizes them.
 */
export async function uploadImage(dataUrl: string, folder: string): Promise<string> {
  const form = new FormData()
  form.append('file', dataUrl)
  form.append('upload_preset', PRESET)
  form.append('folder', `blorbmart/${folder}`)

  let res: Response
  let body: { secure_url?: unknown; error?: { message?: unknown } } = {}
  try {
    res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUD)}/image/upload`, {
      method: 'POST',
      body: form,
      credentials: 'omit',
      signal: AbortSignal.timeout(60_000),
    })
    body = await res.json().catch(() => ({}))
  } catch {
    throw new Error('Could not reach the photo service. Check your connection and try again.')
  }

  if (!res.ok) {
    const reason = body.error?.message
    throw new Error(`That upload failed: ${typeof reason === 'string' ? reason : `status ${res.status}`}`)
  }
  const url = body.secure_url
  if (typeof url !== 'string' || !url.startsWith('https://res.cloudinary.com/')) {
    throw new Error('That upload failed. Please try again.')
  }
  return url
}

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
