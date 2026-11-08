import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Eye, EyeOff, ImagePlus, Pencil, Search, Trash2, Upload } from 'lucide-react'
import { adminApi, errorMessage, type StockImage } from '../lib/api'
import { toCompressedDataUrl, uploadImage } from '../lib/image'
import { Badge, Button, Card, Empty, ErrorState, Input, Modal, PageHeader, Skeleton } from '../components/ui'

type Draft = { id?: string; title: string; category: string; tags: string; url: string; builtIn?: boolean }

const blank = (): Draft => ({ title: '', category: '', tags: '', url: '' })

/**
 * The shared library of food photos. Every visible photo here is offered to
 * vendors in both vendor apps ("Choose a Blorbmart photo") and to admins in
 * Restaurant menus. Hiding a photo stops it being offered; dishes already
 * using it keep it.
 */
export default function StockPhotos() {
  const queryClient = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [uploading, setUploading] = useState(false)

  const photos = useQuery({ queryKey: ['stock-images'], queryFn: adminApi.stockImages })
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['stock-images'] })
    queryClient.invalidateQueries({ queryKey: ['fallback-menu-images'] })
  }

  const save = useMutation({
    mutationFn: (d: Draft) =>
      d.id
        ? adminApi.updateStockImage(d.id, { title: d.title, category: d.category, tags: d.tags })
        : adminApi.createStockImage({ title: d.title, category: d.category, tags: d.tags, url: d.url }),
    onSuccess: (_, d) => {
      toast.success(d.id ? 'Photo updated' : 'Photo added — vendors can use it now')
      setDraft(null)
      refresh()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not save the photo.')),
  })

  const toggle = useMutation({
    mutationFn: (p: StockImage) => adminApi.updateStockImage(p.id, { hidden: !p.hidden }),
    onSuccess: (p) => {
      toast.success(p.hidden ? 'Hidden from vendors' : 'Shown to vendors')
      refresh()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not change that photo.')),
  })

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteStockImage(id),
    onSuccess: () => {
      toast.success('Photo removed')
      refresh()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not remove that photo.')),
  })

  const onUpload = async (file: File | undefined) => {
    if (!file || !draft) return
    setUploading(true)
    try {
      const url = await uploadImage(await toCompressedDataUrl(file, 1400), 'stock')
      setDraft((d) => (d ? { ...d, url } : d))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not upload that photo.')
    } finally {
      setUploading(false)
    }
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const all = photos.data ?? []
    if (!q) return all
    return all.filter((p) => `${p.title} ${p.category} ${p.tags.join(' ')}`.toLowerCase().includes(q))
  }, [photos.data, search])
  const visible = (photos.data ?? []).filter((p) => !p.hidden).length

  return (
    <>
      <PageHeader
        title="Stock food photos"
        subtitle="Photos any vendor can use when they have no picture of their own dish."
        actions={<Button size="sm" variant="primary" icon={ImagePlus} onClick={() => setDraft(blank())}>Add photo</Button>}
      />

      <Card
        title="Library"
        subtitle={photos.data ? `${visible} shown to vendors · ${photos.data.length - visible} hidden` : undefined}
        actions={
          <Input
            aria-label="Search photos"
            placeholder="Search jollof, drinks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56"
          />
        }
      >
        {photos.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-44" />)}</div>
        ) : photos.isError ? (
          <ErrorState message={errorMessage(photos.error)} onRetry={() => photos.refetch()} />
        ) : rows.length === 0 ? (
          <Empty icon={Search} title="No photos match" message="Try another word, or add the photo." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {rows.map((p) => (
              <div key={p.id} className={`overflow-hidden rounded-xl border border-line bg-raised ${p.hidden ? 'opacity-55' : ''}`}>
                <div className="relative h-32 bg-surface-sunk">
                  <img src={p.url} alt={p.title} loading="lazy" className="h-full w-full object-cover" />
                  {p.hidden && <Badge className="absolute left-2 top-2" tone="warn">Hidden</Badge>}
                  {p.builtIn && !p.hidden && <Badge className="absolute left-2 top-2" tone="neutral">Built in</Badge>}
                </div>
                <div className="space-y-2 p-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-ink">{p.title}</p>
                    <p className="truncate text-[11px] text-ink-faint">{p.category}{p.tags.length ? ` · ${p.tags.join(', ')}` : ''}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" icon={Pencil} aria-label={`Edit ${p.title}`} onClick={() => setDraft({ id: p.id, title: p.title, category: p.category, tags: p.tags.join(', '), url: p.url, builtIn: p.builtIn })} />
                    <Button size="sm" icon={p.hidden ? Eye : EyeOff} aria-label={p.hidden ? 'Show to vendors' : 'Hide from vendors'} loading={toggle.isPending && toggle.variables?.id === p.id} onClick={() => toggle.mutate(p)} />
                    {!p.builtIn && (
                      <Button size="sm" variant="danger" icon={Trash2} aria-label={`Delete ${p.title}`} onClick={() => { if (window.confirm(`Delete "${p.title}"? Dishes already using it keep the picture.`)) remove.mutate(p.id) }} />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(draft)}
        onClose={() => !save.isPending && !uploading && setDraft(null)}
        title={draft?.id ? 'Edit photo' : 'Add a stock photo'}
        footer={draft && (
          <>
            <Button onClick={() => setDraft(null)}>Cancel</Button>
            <Button variant="primary" loading={save.isPending} disabled={uploading || !draft.url || draft.title.trim().length < 2} onClick={() => save.mutate(draft)}>
              {draft.id ? 'Save' : 'Add to library'}
            </Button>
          </>
        )}
      >
        {draft && (
          <div className="space-y-4">
            <div>
              {draft.url ? (
                <img src={draft.url} alt="" className="h-44 w-full rounded-lg object-cover" />
              ) : (
                <div className="grid h-44 place-items-center rounded-lg border border-dashed border-line text-[12.5px] text-ink-faint">No photo yet</div>
              )}
              {!draft.id && (
                <div className="mt-2">
                  <Button size="sm" icon={Upload} loading={uploading} onClick={() => input.current?.click()}>{draft.url ? 'Replace photo' : 'Upload photo'}</Button>
                  <input ref={input} className="hidden" type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void onUpload(f) }} />
                </div>
              )}
              {draft.builtIn && <p className="mt-2 text-[12px] text-ink-faint">Built-in photo: you can rename or hide it, but not replace or delete it.</p>}
            </div>
            <Input label="Name" placeholder="Jollof rice and chicken" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            <Input label="Category" placeholder="rice, swallow, drinks, snacks…" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
            <Input label="Search words (comma separated)" placeholder="jollof, party rice, chicken" value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} />
            <p className="text-[12px] text-ink-faint">Use photos Blorbmart owns or may reuse. A customer should recognise the dish, so pick a photo that looks like what Nigerian campus kitchens serve.</p>
          </div>
        )}
      </Modal>
    </>
  )
}
