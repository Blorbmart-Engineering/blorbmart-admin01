import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { ImagePlus } from 'lucide-react'
import { toCompressedDataUrl } from '../lib/image'
import { Button, cn } from './ui'

/**
 * Picks a photo, shrinks it in the browser and hands it back as a data URL,
 * with a preview of what is there now. Used for market photos and event covers.
 */
export function PhotoPicker({
  current,
  pending,
  onPick,
  onClear,
  square = true,
  maxSide = 1200,
  busy = false,
}: {
  current: string
  pending: string | null
  onPick: (dataUrl: string) => void
  onClear: () => void
  square?: boolean
  /** Longest side, in pixels, the photo is shrunk to before it is used. */
  maxSide?: number
  /** True while the caller is still doing something with the photo, such as uploading it. */
  busy?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [preparing, setPreparing] = useState(false)
  const shown = pending ?? current

  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          'shrink-0 overflow-hidden rounded-lg border border-line bg-surface-sunk',
          square ? 'h-20 w-20' : 'h-20 w-40',
        )}
      >
        {shown ? (
          <img src={shown} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-ink-faint">
            <ImagePlus className="h-6 w-6" aria-hidden />
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            setPreparing(true)
            try {
              onPick(await toCompressedDataUrl(file, maxSide))
            } catch (error) {
              toast.error(error instanceof Error ? error.message : 'Could not use that image.')
            } finally {
              setPreparing(false)
            }
          }}
        />
        <Button size="sm" icon={ImagePlus} loading={preparing || busy} onClick={() => input.current?.click()}>
          {shown ? 'Change photo' : 'Add photo'}
        </Button>
        {shown && (
          <Button size="sm" variant="ghost" onClick={onClear}>
            Remove
          </Button>
        )}
      </div>
    </div>
  )
}
