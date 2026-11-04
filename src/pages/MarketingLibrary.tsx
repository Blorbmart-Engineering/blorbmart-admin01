import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Copy, Film, Plus, Upload } from 'lucide-react'
import { adminApi, errorMessage, type MarketingAsset } from '../lib/api'
import { dateOnly, text, titleCase } from '../lib/format'
import { uploadMedia } from '../lib/image'
import {
  Badge,
  Button,
  Card,
  DataTable,
  Empty,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea,
  Toolbar,
  type Column,
} from '../components/ui'

const label = (v: string) => titleCase(v.replace(/_/g, ' '))

const BLANK = {
  title: '',
  category: 'brand_awareness',
  kind: 'flyer',
  status: 'draft',
  campaign: '',
  mediaUrl: '',
  caption: '',
  hashtags: '',
  startDate: '',
  endDate: '',
  notes: '',
}

/**
 * Every flyer, promo video, caption and vendor message, filed by campaign and
 * category so the team can find and reuse them. A library, not a sender:
 * copy the caption, download the file, post it yourself.
 *
 * Brand: blue #1F77F1, lime #AFFF00, yellow #FFC200, Raleway, no needless
 * gradients; the lime logo always on a dark ground. Advertise only what the
 * app does today.
 */
export default function MarketingLibrary() {
  const queryClient = useQueryClient()
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState<(typeof BLANK & { id?: string }) | null>(null)
  const [uploading, setUploading] = useState(false)

  const options = useQuery({ queryKey: ['marketing-options'], queryFn: adminApi.marketingOptions, staleTime: Infinity })
  const assets = useQuery({
    queryKey: ['marketing-library', category, status],
    queryFn: () => adminApi.marketingLibrary({ category: category || undefined, status: status || undefined }),
  })

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...editing!,
        startDate: editing!.startDate || null,
        endDate: editing!.endDate || null,
        mediaUrl: editing!.mediaUrl || null,
      }
      return editing!.id ? adminApi.updateMarketingAsset(editing!.id, body) : adminApi.createMarketingAsset(body)
    },
    onSuccess: () => {
      toast.success('Saved')
      setEditing(null)
      queryClient.invalidateQueries({ queryKey: ['marketing-library'] })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not save.')),
  })

  const archive = useMutation({
    mutationFn: (id: string) => adminApi.archiveMarketingAsset(id),
    onSuccess: () => {
      toast.success('Archived')
      setEditing(null)
      queryClient.invalidateQueries({ queryKey: ['marketing-library'] })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not archive.')),
  })

  const copy = async (a: MarketingAsset) => {
    const textToCopy = [a.caption, (a.hashtags ?? []).map((h) => `#${h}`).join(' ')].filter(Boolean).join('\n\n')
    await navigator.clipboard.writeText(textToCopy).then(
      () => toast.success('Caption copied'),
      () => toast.error('Could not copy'),
    )
  }

  const onFile = async (file: File | undefined) => {
    if (!file || !editing) return
    setUploading(true)
    try {
      const url = await uploadMedia(file, 'marketing')
      setEditing({ ...editing, mediaUrl: url, kind: file.type.startsWith('video/') ? 'video' : editing.kind })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const columns: Column<MarketingAsset>[] = [
    {
      key: 'title',
      header: 'Asset',
      render: (a) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{a.title}</p>
          <p className="truncate text-[11.5px] text-ink-faint">{text(a.campaign, 'No campaign')}</p>
        </div>
      ),
    },
    { key: 'kind', header: 'Type', render: (a) => label(a.kind) },
    { key: 'category', header: 'Category', render: (a) => <Badge tone="brand">{label(a.category)}</Badge> },
    {
      key: 'dates',
      header: 'Runs',
      render: (a) => (a.startDate ? `${dateOnly(a.startDate)} → ${a.endDate ? dateOnly(a.endDate) : '…'}` : '—'),
    },
    {
      key: 'status',
      header: 'Status',
      render: (a) => (
        <Badge tone={a.status === 'published' ? 'good' : a.status === 'archived' ? 'neutral' : 'info'}>{a.status}</Badge>
      ),
    },
    {
      key: 'copy',
      header: '',
      align: 'right',
      render: (a) =>
        a.caption ? (
          <Button
            size="sm"
            icon={Copy}
            onClick={(e) => {
              e.stopPropagation()
              void copy(a)
            }}
          >
            Caption
          </Button>
        ) : null,
    },
  ]

  return (
    <>
      <PageHeader
        title="Marketing library"
        subtitle="Flyers, videos, captions and vendor messages, filed by campaign. Post them yourself; nothing here sends."
        actions={
          <Button size="sm" variant="primary" icon={Plus} onClick={() => setEditing({ ...BLANK })}>
            Add
          </Button>
        }
      />

      <Card
        bodyClassName="p-0"
        title={
          <Toolbar>
            <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-52">
              <option value="">All</option>
              {(options.data?.categories ?? []).map((c) => (
                <option key={c} value={c}>
                  {label(c)}
                </option>
              ))}
            </Select>
            <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
              <option value="">All</option>
              {(options.data?.statuses ?? []).map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </Select>
          </Toolbar>
        }
      >
        <DataTable
          columns={columns}
          rows={assets.data ?? []}
          keyOf={(a) => a.id}
          loading={assets.isLoading}
          error={assets.isError ? errorMessage(assets.error) : null}
          onRowClick={(a) =>
            setEditing({
              id: a.id,
              title: a.title,
              category: a.category,
              kind: a.kind,
              status: a.status,
              campaign: a.campaign ?? '',
              mediaUrl: a.mediaUrl ?? '',
              caption: a.caption ?? '',
              hashtags: (a.hashtags ?? []).map((h) => `#${h}`).join(' '),
              startDate: a.startDate ?? '',
              endDate: a.endDate ?? '',
              notes: a.notes ?? '',
            })
          }
          empty={<Empty icon={Film} title="Nothing filed yet" message="Add the first flyer, video or caption." />}
        />
      </Card>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit asset' : 'Add to the library'}
        wide
        footer={
          editing && (
            <>
              {editing.id && editing.status !== 'archived' && (
                <Button onClick={() => archive.mutate(editing.id!)} loading={archive.isPending}>
                  Archive
                </Button>
              )}
              <Button onClick={() => setEditing(null)}>Cancel</Button>
              <Button
                variant="primary"
                loading={save.isPending}
                disabled={!editing.title.trim() || uploading}
                onClick={() => save.mutate()}
              >
                Save
              </Button>
            </>
          )
        }
      >
        {editing && (
          <div className="space-y-3">
            <Input label="Title" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Select label="Type" value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value })}>
                {(options.data?.kinds ?? []).map((k) => (
                  <option key={k} value={k}>
                    {label(k)}
                  </option>
                ))}
              </Select>
              <Select
                label="Category"
                value={editing.category}
                onChange={(e) => setEditing({ ...editing, category: e.target.value })}
              >
                {(options.data?.categories ?? []).map((c) => (
                  <option key={c} value={c}>
                    {label(c)}
                  </option>
                ))}
              </Select>
              <Select label="Status" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                {(options.data?.statuses ?? []).map((s) => (
                  <option key={s} value={s}>
                    {label(s)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label="Campaign"
                placeholder="e.g. Christmas 2026"
                value={editing.campaign}
                onChange={(e) => setEditing({ ...editing, campaign: e.target.value })}
              />
              <Input
                label="Starts"
                type="date"
                value={editing.startDate}
                onChange={(e) => setEditing({ ...editing, startDate: e.target.value })}
              />
              <Input
                label="Ends"
                type="date"
                value={editing.endDate}
                onChange={(e) => setEditing({ ...editing, endDate: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-brand">
                <Upload size={16} aria-hidden />
                {uploading ? 'Uploading…' : editing.mediaUrl ? 'Replace file' : 'Upload flyer or video'}
                <input
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(e) => void onFile(e.target.files?.[0])}
                />
              </label>
              {editing.mediaUrl && (
                <a className="truncate text-[12px] text-ink-soft underline" href={editing.mediaUrl} target="_blank" rel="noreferrer">
                  Open the file
                </a>
              )}
            </div>
            <Textarea
              label="Caption"
              rows={4}
              value={editing.caption}
              onChange={(e) => setEditing({ ...editing, caption: e.target.value })}
            />
            <Input
              label="Hashtags"
              placeholder="#Blorbmart #WhereStudentBudgetWins"
              value={editing.hashtags}
              onChange={(e) => setEditing({ ...editing, hashtags: e.target.value })}
            />
            <Textarea
              label="Notes (where it went, results)"
              rows={2}
              value={editing.notes}
              onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
            />
            <p className="text-[12px] text-ink-faint">
              Advertise only what the app does today. Bill payments and other switchable features can be off; check
              Settings first.
            </p>
          </div>
        )}
      </Modal>
    </>
  )
}
