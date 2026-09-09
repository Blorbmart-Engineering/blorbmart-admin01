import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { MapPin, Plus, Trash2 } from 'lucide-react'
import { adminApi, errorMessage, type Row } from '../lib/api'
import { money, text } from '../lib/format'
import {
  Badge,
  Button,
  Card,
  DataTable,
  Empty,
  Input,
  Modal,
  PageHeader,
  type Column,
} from '../components/ui'

const asRows = (data: unknown): Row[] => {
  if (Array.isArray(data)) return data as Row[]
  const wrapped = (data as { landmarks?: Row[] })?.landmarks
  return Array.isArray(wrapped) ? wrapped : []
}

/**
 * Delivery zones.
 *
 * Each landmark is a named place with its own delivery price, which is what a
 * buyer picks instead of typing an address a rider then cannot find. Editing
 * the price here changes what the next customer pays, so the price column is
 * editable in place — the alternative, a modal per row, makes a bulk price
 * change on twenty hostels a twenty-modal job.
 */
export default function Landmarks() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [edits, setEdits] = useState<Record<string, string>>({})

  const landmarks = useQuery({ queryKey: ['landmarks'], queryFn: adminApi.landmarks, staleTime: 60_000 })

  const create = useMutation({
    mutationFn: () => adminApi.createLandmark({ name: name.trim(), price: Number(price) || 0, active: true }),
    onSuccess: () => {
      toast.success('Zone added')
      queryClient.invalidateQueries({ queryKey: ['landmarks'] })
      setOpen(false)
      setName('')
      setPrice('')
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not add the zone.')),
  })

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Row }) => adminApi.updateLandmark(id, body),
    onSuccess: (_d, v) => {
      toast.success('Zone updated')
      queryClient.invalidateQueries({ queryKey: ['landmarks'] })
      setEdits((prev) => {
        const next = { ...prev }
        delete next[v.id]
        return next
      })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update the zone.')),
  })

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteLandmark(id),
    onSuccess: () => {
      toast.success('Zone removed')
      queryClient.invalidateQueries({ queryKey: ['landmarks'] })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not remove the zone.')),
  })

  const columns: Column<Row>[] = [
    { key: 'name', header: 'Zone', render: (l) => <span className="font-semibold text-ink">{text(l.name)}</span> },
    {
      key: 'price',
      header: 'Delivery price',
      align: 'right',
      render: (l) => {
        const id = String(l.id)
        const current = edits[id]
        return (
          <div className="flex items-center justify-end gap-2">
            <input
              type="number"
              value={current ?? String(l.price ?? '')}
              onChange={(e) => setEdits({ ...edits, [id]: e.target.value })}
              className="h-8 w-24 rounded-md border border-line bg-raised px-2 text-right text-[13px] tabular text-ink outline-none focus:border-brand"
              aria-label={`Delivery price for ${text(l.name)}`}
            />
            {current !== undefined && current !== String(l.price ?? '') && (
              <Button
                size="sm"
                variant="primary"
                loading={update.isPending}
                onClick={() => update.mutate({ id, body: { price: Number(current) || 0 } })}
              >
                Save
              </Button>
            )}
          </div>
        )
      },
    },
    {
      key: 'state',
      header: 'State',
      render: (l) => (
        <Badge tone={l.active === false ? 'neutral' : 'good'} dot>
          {l.active === false ? 'Hidden' : 'Live'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (l) => (
        <div className="flex justify-end gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => update.mutate({ id: String(l.id), body: { active: l.active === false } })}
          >
            {l.active === false ? 'Show' : 'Hide'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={Trash2}
            aria-label={`Remove ${text(l.name)}`}
            onClick={() => {
              if (confirm(`Remove the "${text(l.name)}" zone? Buyers will no longer be able to pick it.`)) {
                remove.mutate(String(l.id))
              }
            }}
          >
            {''}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Delivery zones"
        subtitle="Named drop-off points and what each one costs to deliver to."
        actions={
          <Button size="sm" variant="primary" icon={Plus} onClick={() => setOpen(true)}>
            Add zone
          </Button>
        }
      />

      <Card bodyClassName="p-0">
        <DataTable
          columns={columns}
          rows={asRows(landmarks.data)}
          keyOf={(l, i) => String(l.id ?? i)}
          loading={landmarks.isLoading}
          error={landmarks.isError ? errorMessage(landmarks.error) : null}
          onRetry={() => landmarks.refetch()}
          empty={
            <Empty
              icon={MapPin}
              title="No delivery zones"
              message="Add the hostels and landmarks buyers deliver to."
              action={
                <Button size="sm" variant="primary" icon={Plus} onClick={() => setOpen(true)}>
                  Add zone
                </Button>
              }
            />
          }
        />
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add delivery zone"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={create.isPending}
              disabled={!name.trim()}
              onClick={() => create.mutate()}
            >
              Add zone
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Input
            label="Zone name"
            placeholder="e.g. Angola Hostel"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="Delivery price (₦)"
            type="number"
            inputMode="numeric"
            placeholder="300"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <p className="text-[12px] leading-relaxed text-ink-faint">
            Buyers pick this name at checkout instead of typing an address, and pay{' '}
            {price ? money(price) : 'this price'} for delivery to it.
          </p>
        </div>
      </Modal>
    </>
  )
}
