import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Images } from 'lucide-react'
import api, { errorMessage, type Row } from '../lib/api'
import { ago, text } from '../lib/format'
import { Badge, Button, Card, Empty, ErrorState, PageHeader, Skeleton } from '../components/ui'

/**
 * The home-screen carousel.
 *
 * Slides are shown as slides rather than as table rows, because the only
 * question worth asking here is "does this look right on the buyer's home
 * screen", and a filename in a cell cannot answer it. Ordering and visibility
 * are the two things that change often, so those are the controls on each card.
 */
export default function Carousel() {
  const queryClient = useQueryClient()

  const slides = useQuery({
    queryKey: ['carousel'],
    queryFn: async () => {
      const res = await api.get('/api/admin/carousel')
      const data = res.data?.data
      return (Array.isArray(data) ? data : (data?.slides ?? [])) as Row[]
    },
    staleTime: 60_000,
  })

  const toggle = useMutation({
    mutationFn: (id: string) => api.patch(`/api/admin/carousel/${id}/toggle`),
    onSuccess: () => {
      toast.success('Slide updated')
      queryClient.invalidateQueries({ queryKey: ['carousel'] })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update the slide.')),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/carousel/${id}`),
    onSuccess: () => {
      toast.success('Slide deleted')
      queryClient.invalidateQueries({ queryKey: ['carousel'] })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not delete the slide.')),
  })

  const reorder = useMutation({
    mutationFn: (order: { id: string; displayOrder: number }[]) =>
      api.patch('/api/admin/carousel/reorder', { order }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carousel'] })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not reorder slides.')),
  })

  const rows = slides.data ?? []

  const move = (index: number, direction: -1 | 1) => {
    const next = [...rows]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    reorder.mutate(next.map((slide, i) => ({ id: String(slide.id), displayOrder: i })))
  }

  if (slides.isError) {
    return (
      <>
        <PageHeader title="Carousel" />
        <Card>
          <ErrorState message={errorMessage(slides.error)} onRetry={() => slides.refetch()} />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Carousel"
        subtitle="Promotional slides on the buyer app home screen."
      />

      {slides.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <Empty
            icon={Images}
            title="No slides"
            message="The buyer home screen is showing no promotional carousel."
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((slide, index) => {
            const id = String(slide.id)
            const active = slide.isActive !== false
            const image = text(slide.imageUrl ?? slide.image, '')

            return (
              <article key={id} className="overflow-hidden rounded-xl border border-line bg-panel">
                <div className="relative aspect-[16/9] bg-raised">
                  {image ? (
                    <img
                      src={image}
                      alt={text(slide.title, 'Carousel slide')}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-ink-faint">
                      <Images className="h-6 w-6" aria-hidden />
                    </div>
                  )}
                  {!active && (
                    <span className="absolute inset-0 grid place-items-center bg-black/60">
                      <Badge tone="neutral">Hidden</Badge>
                    </span>
                  )}
                </div>

                <div className="p-3.5">
                  <p className="truncate text-[13.5px] font-bold text-ink">{text(slide.title, 'Untitled')}</p>
                  <p className="mt-0.5 truncate text-[12px] text-ink-faint">
                    {text(slide.subtitle ?? slide.description, 'No caption')}
                  </p>
                  <p className="mt-1.5 text-[11px] text-ink-faint">
                    Position {index + 1} · added {ago(slide.createdAt)}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Button size="sm" disabled={index === 0 || reorder.isPending} onClick={() => move(index, -1)}>
                      ↑
                    </Button>
                    <Button
                      size="sm"
                      disabled={index === rows.length - 1 || reorder.isPending}
                      onClick={() => move(index, 1)}
                    >
                      ↓
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggle.mutate(id)}>
                      {active ? 'Hide' : 'Show'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-bad"
                      onClick={() => {
                        if (confirm(`Delete the "${text(slide.title)}" slide?`)) remove.mutate(id)
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">
        Slides are created with images uploaded through the backend's carousel endpoints. Reordering and
        visibility take effect on the buyer app's next home-screen load.
      </p>
    </>
  )
}
